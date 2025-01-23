require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dns = require('dns');
const fs = require('fs');
const url = require('url');

class URLShortenerService {
  constructor(filePath = './public/data.json') {
    this.filePath = filePath;
    this.ensureFileExists();
  }

  // Ensure data storage file exists
  ensureFileExists() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([]));
    }
  }

  // Comprehensive URL validation
  validateURL(inputUrl) {
    try {
      // Attempt to parse the URL
      const parsedUrl = new url.URL(
        inputUrl.startsWith('http') ? inputUrl : `http://${inputUrl}`
      );

      // Check for valid protocol and hostname
      const validProtocols = ['http:', 'https:'];
      return validProtocols.includes(parsedUrl.protocol) && 
             parsedUrl.hostname.includes('.');
    } catch {
      return false;
    }
  }

  // Manage data storage operations
  processData(action, inputData = null) {
    const fileContent = this.readFileContent();

    if (action === 'save' && inputData) {
      // Prevent duplicate URLs
      const isDuplicate = fileContent.some(
        entry => entry.original_url === inputData.original_url
      );

      if (!isDuplicate) {
        fileContent.push(inputData);
        this.writeFileContent(fileContent);
      }
    }

    if (action === 'load') {
      return fileContent.length > 0 ? fileContent : null;
    }
  }

  // Read file contents
  readFileContent() {
    const rawData = fs.readFileSync(this.filePath);
    return rawData.length > 0 ? JSON.parse(rawData) : [];
  }

  // Write file contents
  writeFileContent(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  // Generate unique short URL
  generateShortURL() {
    const existingData = this.processData('load') || [];
    const maxAttempts = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateShort = this.createUniqueShortCode(existingData);
      
      const isUnique = !existingData.some(
        entry => entry.short_url === candidateShort
      );

      if (isUnique) return candidateShort;
    }

    throw new Error('Unable to generate unique short URL');
  }

  // Create unique short code
  createUniqueShortCode(existingData) {
    const baseRange = existingData.length > 0 
      ? existingData.length * 1000 
      : 1000;
    
    return Math.floor(Math.random() * baseRange) + 1;
  }

  // Find URL by short code
  findURLByShortCode(shortCode) {
    const existingData = this.processData('load') || [];
    return existingData.find(entry => entry.short_url === shortCode);
  }
}

// Express application setup
const app = express();
const port = process.env.PORT || 3000;
const urlShortener = new URLShortenerService();

app.use(cors());
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

// URL shortening endpoint
app.post('/api/shorturl', (req, res) => {
  const inputURL = req.body.url;
  
  // Check for empty input
  if (!inputURL) {
    return res.json({ error: 'invalid url' });
  }

  // Validate URL format
  if (!urlShortener.validateURL(inputURL)) {
    return res.json({ error: 'invalid url' });
  }

  // Normalize URL
  const normalizedURL = inputURL.startsWith('http') 
    ? inputURL 
    : `http://${inputURL}`;

  // Extract domain for DNS lookup
  const parsedURL = new url.URL(normalizedURL);
  const domain = parsedURL.hostname.replace(/^www\./, '');

  // DNS validation
  dns.lookup(domain, (err) => {
    if (err) {
      return res.json({ error: 'invalid url' });
    }

    // Generate and save short URL
    const shortCode = urlShortener.generateShortURL();
    const urlEntry = {
      original_url: normalizedURL,
      short_url: shortCode
    };

    urlShortener.processData('save', urlEntry);
    res.json(urlEntry);
  });
});

// Redirect endpoint
app.get('/api/shorturl/:shorturl', (req, res) => {
  const shortCode = Number(req.params.shorturl);
  const matchedEntry = urlShortener.findURLByShortCode(shortCode);

  if (matchedEntry) {
    res.redirect(matchedEntry.original_url);
  } else {
    res.status(404).json({ 
      error: 'Short URL not found', 
      short: shortCode 
    });
  }
});

// Hello API endpoint
app.get('/api/hello', (req, res) => {
  res.json({ greeting: 'hello API' });
});

// Start server
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

module.exports = app;