const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer so Render doesn't lose it.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
