const { addonBuilder, serveHTTP, get== } = require('stremio-addon-sdk');
const manifest = require('./manifest.json');
const express = require('express');

const app = express();
app.use(express.static('public'));

const builder = new addonBuilder(manifest);

// Serve the manifest.json
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(manifest);
});

// Catalog route (all of One Pace in one catalog)
builder.defineCatalogHandler(async (args) => {
  if (args.id === 'onepace-torbox') {
    return Promise.resolve({
      metas: [{
        id: 'onepace-torbox-series',
        name: 'One Pace',
        type: 'series',
        poster: 'https://i.imgur.com/k91B01C.jpg',
        posterShape: 'regular',
        background: 'https://i.imgur.com/k91B01C.jpg',
        logo: 'https://i.imgur.com/v8tT4d9.png',
        description: 'A fan-edited version of the One Piece anime with filler and padding removed to match the manga’s pacing.',
        genres: ['Action', 'Adventure', 'Fantasy'],
        releaseInfo: '2024',
        // Example for how to structure a series with episodes
        // This is a single meta object for the whole series
      }]
    });
  }
  return Promise.resolve({ metas: [] });
});

// Meta handler for the main One Pace series
builder.defineMetaHandler(async (args) => {
  if (args.id === 'onepace-torbox-series') {
    const meta = {
      id: 'onepace-torbox-series',
      name: 'One Pace',
      type: 'series',
      poster: 'https://i.imgur.com/k91B01C.jpg',
      posterShape: 'regular',
      background: 'https://i.imgur.com/k91B01C.jpg',
      logo: 'https://i.imgur.com/v8tT4d9.png',
      description: 'A fan-edited version of the One Piece anime with filler and padding removed to match the manga’s pacing.',
      genres: ['Action', 'Adventure', 'Fantasy'],
      releaseInfo: '2024',
      // Provide a few example episodes for the first season
      videos: [{
        id: 'onepace-torbox-series:1:1',
        title: 'Episode 1',
        season: 1,
        episode: 1,
        // The first episode of the first arc in One Pace
      }, {
        id: 'onepace-torbox-series:1:2',
        title: 'Episode 2',
        season: 1,
        episode: 2,
      }, {
        id: 'onepace-torbox-series:1:3',
        title: 'Episode 3',
        season: 1,
        episode: 3,
      }]
    };
    return Promise.resolve({ meta });
  }
  return Promise.resolve({ meta: null });
});

// Stream handler with test streams
builder.defineStreamHandler(async (args) => {
  // Check if it's the One Pace series and the episode is valid
  if (args.id.startsWith('onepace-torbox-series:')) {
    // Return a test stream, we will replace this with Torbox later
    return Promise.resolve({
      streams: [{
        title: 'Test Stream (Big Buck Bunny)',
        url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_stereo.mp4'
      }]
    });
  }
  return Promise.resolve({ streams: [] });
});

serveHTTP(builder.get = app.get, { port: process.env.PORT || 3000 });
