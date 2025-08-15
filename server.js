const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const manifest = require('./manifest.json');
const fetch = require('node-fetch');

const builder = new addonBuilder(manifest);

// --- Data Fetching and Caching ---
// We cache the episode data to avoid fetching it from the API on every single request.
// The cache will last for 4 hours (14400000 milliseconds).
let cachedEpisodes = null;
let cacheTime = null;

async function getEpisodes() {
    if (cachedEpisodes && cacheTime && (Date.now() - cacheTime < 14400000)) {
        return cachedEpisodes;
    }

    try {
        const response = await fetch('https://onepace.net/api/v2/projects');
        if (!response.ok) {
            throw new Error(`Failed to fetch One Pace data: ${response.statusText}`);
        }
        const data = await response.json();
        
        // Process the data into a more usable format
        const sagas = {};
        let seasonCounter = 0;

        for (const arc of data.arcs) {
            if (!sagas[arc.saga.name]) {
                seasonCounter++;
                sagas[arc.saga.name] = {
                    season: seasonCounter,
                    episodes: []
                };
            }
            // Map arc episodes to Stremio episode format
            sagas[arc.saga.name].episodes.push(...arc.episodes.map((ep, index) => ({
                id: `onepace:${sagas[arc.saga.name].season}:${arc.part + index}`,
                title: ep.part_name,
                season: sagas[arc.saga.name].season,
                episode: arc.part + index, // Use arc part as a base for episode number
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
        // Return the old cache if fetching fails, or an empty array if there's no cache
        return cachedEpisodes || [];
    }
}


// --- Addon Handlers ---

// Catalog Handler (unchanged, but clean)
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

// Meta Handler (now dynamic)
builder.defineMetaHandler(async (args) => {
    if (args.id === 'onepace-series') {
        const episodes = await getEpisodes();
        const meta = {
            id: 'onepace-series',
            name: 'One Pace',
            type: 'series',
            poster: 'https://i.imgur.com/k91B01C.jpg',
            background: 'https://i.imgur.com/k91B01C.jpg',
            logo: 'https://i.imgur.com/v8tT4d9.png',
            description: 'A fan-edited version of the One Piece anime with filler and padding removed to match the manga’s pacing.',
            videos: episodes, // Use the dynamically fetched episodes
        };
        return Promise.resolve({ meta });
    }
    return Promise.resolve({ meta: null });
});

// Stream Handler (Torbox Integration)
builder.defineStreamHandler(async (args) => {
    if (!args.id.startsWith('onepace:')) {
        return Promise.resolve({ streams: [] });
    }

    const apiKey = args.config && args.config.torbox_api_key;
    if (!apiKey) {
        return Promise.reject(new Error('Torbox API Key not configured.'));
    }

    const episodes = await getEpisodes();
    const episode = episodes.find(ep => ep.id === args.id);

    if (!episode || !episode.torrents || episode.torrents.length === 0) {
        return Promise.resolve({ streams: [] });
    }

    // We'll just use the first torrent link found for simplicity
    const magnetLink = episode.torrents[0];

    try {
        console.log(`Requesting stream for magnet: ${magnetLink}`);
        const streamUrl = await getTorboxStream(magnetLink, apiKey);
        if (streamUrl) {
            const streams = [{
                title: 'Torbox Stream',
                url: streamUrl,
            }];
            return Promise.resolve({ streams });
        }
    } catch (error) {
        console.error('Torbox API Error:', error.message);
        return Promise.reject(new Error(`Torbox API Error: ${error.message}`));
    }

    return Promise.resolve({ streams: [] });
});

// --- Torbox API Helper ---
async function getTorboxStream(magnet, apiKey) {
    const TORBOX_API_URL = 'https://api.torbox.app/v1/torrents/add';
    
    const response = await fetch(TORBOX_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ link: magnet })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add torrent to Torbox');
    }

    const torrentData = await response.json();
    
    // Find the largest file, which is usually the video
    const videoFile = torrentData.files.reduce((largest, file) => 
        file.size > largest.size ? file : largest
    , torrentData.files[0]);

    if (!videoFile || !videoFile.stream_link) {
        throw new Error('No streamable video file found in the torrent.');
    }

    return videoFile.stream_link;
}


// --- Server Setup ---
const { addonInterface, server } = serveHTTP(builder.getInterface(), {
    port: process.env.PORT || 3000,
    static: '/public' // Serve the public directory for the config page
});

// This is the entry point for Vercel
module.exports = server;
