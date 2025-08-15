const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// Enhanced CORS configuration for Stremio
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// Additional headers for Stremio compatibility
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Cache-Control', 'max-age=3600'); // Cache for 1 hour
    next();
});

const PORT = process.env.PORT || 3000;
const TORBOX_API_BASE = 'https://api.torbox.app/v1/api';

// Manifest for the addon
const manifest = {
    id: 'com.onepace.torbox',
    version: '1.0.2',
    name: 'One Pace (TorBox)',
    description: 'One Pace episodes streamed through TorBox debrid service',
    logo: 'https://onepace.net/images/logo.png',
    resources: ['catalog', 'stream', 'meta'],
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'onepace',
            name: 'One Pace',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        }
    ],
    idPrefixes: ['onepace:'],
    behaviorHints: {
        adult: false,
        p2p: false,
        configurable: true,
        configurationRequired: false
    }
};

// TorBox API helper functions
async function torboxRequest(endpoint, options = {}, apiKey) {
    const url = `${TORBOX_API_BASE}${endpoint}`;
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        throw new Error(`TorBox API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function addTorrentToTorBox(magnetLink, apiKey) {
    try {
        const result = await torboxRequest('/torrents/createtorrent', {
            method: 'POST',
            body: JSON.stringify({
                magnet: magnetLink
            })
        }, apiKey);
        return result;
    } catch (error) {
        console.error('Error adding torrent to TorBox:', error);
        throw error;
    }
}

async function getTorrentInfo(torrentId, apiKey) {
    try {
        const result = await torboxRequest(`/torrents/mylist?id=${torrentId}`, {
            method: 'GET'
        }, apiKey);
        return result;
    } catch (error) {
        console.error('Error getting torrent info:', error);
        throw error;
    }
}

async function getDownloadLink(torrentId, fileId, apiKey) {
    try {
        const result = await torboxRequest(`/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}&file_id=${fileId}`, {
            method: 'GET'
        });
        return result;
    } catch (error) {
        console.error('Error getting download link:', error);
        throw error;
    }
}

// One Pace data fetching functions
async function fetchOnePaceData() {
    try {
        const response = await fetch('https://onepace.net/api/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: `
                    query {
                        episodes {
                            id
                            title
                            arc {
                                title
                                episodes {
                                    manga
                                }
                            }
                            part
                            manga
                            released
                            torrent
                        }
                    }
                `
            })
        });

        const data = await response.json();
        return data.data.episodes;
    } catch (error) {
        console.error('Error fetching One Pace data:', error);
        return [];
    }
}

function formatEpisodeData(episodes) {
    const series = {
        id: 'onepace',
        type: 'series',
        name: 'One Pace',
        poster: 'https://onepace.net/images/logo.png',
        background: 'https://onepace.net/images/background.jpg',
        description: 'One Pace is a fan project that recuts One Piece to bring it more in line with the pacing of the original manga.',
        videos: []
    };

    episodes.forEach((episode, index) => {
        if (episode.released && episode.torrent) {
            series.videos.push({
                id: `onepace:${episode.id}`,
                title: `${episode.arc.title} - Part ${episode.part}`,
                overview: `Manga chapters: ${episode.manga}`,
                episode: index + 1,
                season: 1,
                released: new Date(episode.released).toISOString(),
                thumbnail: 'https://onepace.net/images/episode-thumb.jpg'
            });
        }
    });

    return series;
}

// Helper function to extract API key from various sources
function extractApiKey(req) {
    // Try query parameters first
    let apiKey = req.query.torbox_api_key || req.query.api_key;
    
    // Try to extract from config parameter if present
    const config = req.params.config;
    if (config && config.includes('torbox_api_key=')) {
        const match = config.match(/torbox_api_key=([^&]+)/);
        if (match) apiKey = match[1];
    }
    
    return apiKey;
}

// Helper function to extract episode ID
function extractEpisodeId(id) {
    if (id.startsWith('onepace:')) {
        return id.replace('onepace:', '');
    }
    return id;
}

// API Routes
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
});

app.get('/:config/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
});

app.get('/catalog/series/onepace.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodes = await fetchOnePaceData();
        const series = formatEpisodeData(episodes);
        
        res.json({
            metas: [series]
        });
    } catch (error) {
        console.error('Error in catalog route:', error);
        res.status(500).json({ error: 'Failed to fetch catalog' });
    }
});

app.get('/:config/catalog/series/onepace.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodes = await fetchOnePaceData();
        const series = formatEpisodeData(episodes);
        
        res.json({
            metas: [series]
        });
    } catch (error) {
        console.error('Error in catalog route:', error);
        res.status(500).json({ error: 'Failed to fetch catalog' });
    }
});

app.get('/stream/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodeId = extractEpisodeId(req.params.id);
        const apiKey = extractApiKey(req);
        
        if (!apiKey) {
            return res.status(400).json({ 
                error: 'TorBox API key required. Add ?torbox_api_key=YOUR_KEY to the addon URL in Stremio.' 
            });
        }

        // For now, return a simple response to test
        res.json({ 
            streams: [{
                name: 'TorBox Test',
                title: 'Test stream - Episode ' + episodeId,
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                behaviorHints: {
                    notWebReady: false
                }
            }]
        });
    } catch (error) {
        console.error('Error in stream route:', error);
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

app.get('/:config/stream/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodeId = extractEpisodeId(req.params.id);
        const apiKey = extractApiKey(req);
        
        if (!apiKey) {
            return res.status(400).json({ 
                error: 'TorBox API key required. Add ?torbox_api_key=YOUR_KEY to the addon URL in Stremio.' 
            });
        }

        // For now, return a simple response to test
        res.json({ 
            streams: [{
                name: 'TorBox Test',
                title: 'Test stream - Episode ' + episodeId,
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                behaviorHints: {
                    notWebReady: false
                }
            }]
        });
    } catch (error) {
        console.error('Error in stream route:', error);
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

app.get('/meta/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodeId = extractEpisodeId(req.params.id);
        
        const episodes = await fetchOnePaceData();
        const episode = episodes.find(ep => ep.id.toString() === episodeId);
        
        if (!episode) {
            return res.status(404).json({ error: 'Episode not found' });
        }

        const meta = {
            id: `onepace:${episodeId}`,
            type: 'series',
            name: `${episode.arc.title} - Part ${episode.part}`,
            poster: 'https://onepace.net/images/logo.png',
            background: 'https://onepace.net/images/background.jpg',
            description: `Manga chapters: ${episode.manga}\nReleased: ${new Date(episode.released).toLocaleDateString()}`,
            videos: [{
                id: `onepace:${episodeId}`,
                title: `${episode.arc.title} - Part ${episode.part}`,
                overview: `Manga chapters: ${episode.manga}`,
                episode: 1,
                season: 1,
                released: new Date(episode.released).toISOString()
            }]
        };

        res.json({ meta });
    } catch (error) {
        console.error('Error in meta route:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

app.get('/:config/meta/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodeId = extractEpisodeId(req.params.id);
        
        const episodes = await fetchOnePaceData();
        const episode = episodes.find(ep => ep.id.toString() === episodeId);
        
        if (!episode) {
            return res.status(404).json({ error: 'Episode not found' });
        }

        const meta = {
            id: `onepace:${episodeId}`,
            type: 'series',
            name: `${episode.arc.title} - Part ${episode.part}`,
            poster: 'https://onepace.net/images/logo.png',
            background: 'https://onepace.net/images/background.jpg',
            description: `Manga chapters: ${episode.manga}\nReleased: ${new Date(episode.released).toLocaleDateString()}`,
            videos: [{
                id: `onepace:${episodeId}`,
                title: `${episode.arc.title} - Part ${episode.part}`,
                overview: `Manga chapters: ${episode.manga}`,
                episode: 1,
                season: 1,
                released: new Date(episode.released).toISOString()
            }]
        };

        res.json({ meta });
    } catch (error) {
        console.error('Error in meta route:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

app.get('/', (req, res) => {
    res.json({
        name: 'One Pace TorBox Addon',
        version: '1.0.2',
        description: 'Stremio addon for One Pace content via TorBox',
        manifest: `${req.protocol}://${req.get('host')}/manifest.json`,
        status: 'online'
    });
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// For local development
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`One Pace TorBox Addon running on port ${PORT}`);
        console.log(`Manifest URL: http://localhost:${PORT}/manifest.json`);
    });
}

module.exports = app;
