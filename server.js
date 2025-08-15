const express = require('express');
const path = require('path');
const { addonBuilder, getInterface } = require('stremio-addon-sdk');
const manifest = require('./manifest.json');
const fetch = require('node-fetch');

// --- All previous logic is unchanged ---

const builder = new addonBuilder(manifest);

let cachedEpisodes = null;
let cacheTime = null;

async function getEpisodes() {
    if (cachedEpisodes && cacheTime && (Date.now() - cacheTime < 14400000)) {
        return cachedEpisodes;
    }
    try {
        const response = await fetch('https://onepace.net/api/v2/projects');
        if (!response.ok) throw new Error(`Failed to fetch One Pace data: ${response.statusText}`);
        const data = await response.json();
        
        const sagas = {};
        let seasonCounter = 0;

        for (const arc of data.arcs) {
            if (!sagas[arc.saga.name]) {
                seasonCounter++;
                sagas[arc.saga.name] = { season: seasonCounter, episodes: [] };
            }
            sagas[arc.saga.name].episodes.push(...arc.episodes.map((ep, index) => ({
                id: `onepace:${sagas[arc.saga.name].season}:${arc.part + index}`,
                title: ep.part_name,
                season: sagas[arc.saga.name].season,
                episode: arc.part + index,
                released: new Date(ep.released_at).toISOString(),
                overview: `Saga: ${arc.saga.name} | Arc: ${arc.name}`,
                thumbnail: `https://onepace.net/images/episodes/${ep.id}.jpg`,
                torrents: ep.downloads.reduce((acc, curr) => {
                    if (curr.torrent_url) acc.push(curr.torrent_url);
                    return acc;
                }, [])
            })));
        }

        cachedEpisodes = Object.values(sagas).flatMap(saga => saga.episodes);
        cacheTime = Date.now();
        console.log('Successfully fetched and processed One Pace episodes.');
        return cachedEpisodes;
    } catch (error) {
        console.error('Error fetching episodes:', error);
        return cachedEpisodes || [];
    }
}

builder.defineCatalogHandler(args => {
    if (args.id === 'onepace-catalog') {
        const meta = {
            id: 'onepace-series',
            name: 'One Pace',
            type: 'series',
            poster: 'https://i.imgur.com/k91B01C.jpg',
            description: 'A fan-edited version of the One Piece anime with filler and padding removed to match the manga’s pacing.',
        };
        return Promise.resolve({ metas: [meta] });
    }
    return Promise.resolve({ metas: [] });
});

builder.defineMetaHandler(async (args) => {
    if (args.id === 'onepace-series') {
        const episodes = await getEpisodes();
        const meta = {
            id: 'onepace-series', name: 'One Pace', type: 'series',
            poster: 'https://i.imgur.com/k91B01C.jpg', background: 'https://i.imgur.com/k91B01C.jpg',
            logo: 'https://i.imgur.com/v8tT4d9.png',
            description: 'A fan-edited version of the One Piece anime with filler and padding removed to match the manga’s pacing.',
            videos: episodes,
        };
        return Promise.resolve({ meta });
    }
    return Promise.resolve({ meta: null });
});

builder.defineStreamHandler(async (args) => {
    if (!args.id.startsWith('onepace:')) return Promise.resolve({ streams: [] });

    const apiKey = args.config && args.config.torbox_api_key;
    if (!apiKey) return Promise.reject(new Error('Torbox API Key not configured.'));

    const episodes = await getEpisodes();
    const episode = episodes.find(ep => ep.id === args.id);

    if (!episode || !episode.torrents || episode.torrents.length === 0) return Promise.resolve({ streams: [] });

    const magnetLink = episode.torrents[0];

    try {
        console.log(`Requesting stream for magnet: ${magnetLink}`);
        const streamUrl = await getTorboxStream(magnetLink, apiKey);
        if (streamUrl) {
            return Promise.resolve({ streams: [{ title: 'Torbox Stream', url: streamUrl }] });
        }
    } catch (error) {
        console.error('Torbox API Error:', error.message);
        return Promise.reject(new Error(`Torbox API Error: ${error.message}`));
    }
    return Promise.resolve({ streams: [] });
});

async function getTorboxStream(magnet, apiKey) {
    const TORBOX_API_URL = 'https://api.torbox.app/v1/torrents/add';
    const response = await fetch(TORBOX_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ link: magnet })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add torrent to Torbox');
    }
    const torrentData = await response.json();
    const videoFile = torrentData.files.reduce((largest, file) => file.size > largest.size ? file : largest, torrentData.files[0]);
    if (!videoFile || !videoFile.stream_link) throw new Error('No streamable video file found in the torrent.');
    return videoFile.stream_link;
}

// --- NEW SERVER SETUP ---
const app = express();
const addonInterface = getInterface(builder);

// Serve the static configuration page for the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve other static files from the 'public' folder if needed
app.use(express.static(path.join(__dirname, 'public')));

// Let the Stremio SDK handle all other addon-related routes
app.use((req, res, next) => {
    // We pass 'next' as the 3rd argument to tell the SDK
    // to call the next middleware if it doesn't handle the request.
    addonInterface(req, res, next);
});

// Export the express app for Vercel
module.exports = app;
