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
        // Try the GraphQL API first
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

            if (response.ok) {
                const data = await response.json();
                if (data && data.data && data.data.episodes) {
                    return data.data.episodes;
                }
            }
        } catch (graphqlError) {
            console.log('GraphQL API not available, using fallback data');
        }

        // Fallback: Return mock data based on known One Pace episodes
        return [
            {
                id: 1,
                title: "Romance Dawn 01",
                arc: { title: "Romance Dawn" },
                part: 1,
                manga: "1-7",
                released: "2014-03-16T00:00:00Z",
                torrent: "magnet:?xt=urn:btih:example1&dn=One%20Pace%20Romance%20Dawn%2001"
            },
            {
                id: 2,
                title: "Orange Town 01",
                arc: { title: "Orange Town" },
                part: 1,
                manga: "8-21",
                released: "2014-03-20T00:00:00Z",
                torrent: "magnet:?xt=urn:btih:example2&dn=One%20Pace%20Orange%20Town%2001"
            },
            {
                id: 3,
                title: "Syrup Village 01",
                arc: { title: "Syrup Village" },
                part: 1,
                manga: "22-41",
                released: "2014-04-01T00:00:00Z",
                torrent: "magnet:?xt=urn:btih:example3&dn=One%20Pace%20Syrup%20Village%2001"
            },
            {
                id: 4,
                title: "Baratie 01",
                arc: { title: "Baratie" },
                part: 1,
                manga: "42-68",
                released: "2014-04-15T00:00:00Z",
                torrent: "magnet:?xt=urn:btih:example4&dn=One%20Pace%20Baratie%2001"
            },
            {
                id: 5,
                title: "Arlong Park 01",
                arc: { title: "Arlong Park" },
                part: 1,
                manga: "69-95",
                released: "2014-05-01T00:00:00Z",
                torrent: "magnet:?xt=urn:btih:example5&dn=One%20Pace%20Arlong%20Park%2001"
            }
        ];
    } catch (error) {
        console.error('Error fetching One Pace data:', error);
        // Return empty array if everything fails
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
        
        if (!apiKey || apiKey === 'test') {
            return res.json({ 
                streams: [{
                    name: 'TorBox Setup Required',
                    title: '⚠️ Please add your TorBox API key to the addon URL\n\nGet your API key from torbox.app → Settings → API',
                    url: '',
                    behaviorHints: {
                        notWebReady: true
                    }
                }]
            });
        }

        // Fetch episode data
        const episodes = await fetchOnePaceData();
        const episode = episodes.find(ep => ep.id.toString() === episodeId);
        
        if (!episode) {
            return res.json({ 
                streams: [{
                    name: 'Episode Not Found',
                    title: `❌ Episode ${episodeId} not found in catalog`,
                    url: '',
                    behaviorHints: {
                        notWebReady: true
                    }
                }]
            });
        }

        if (!episode.torrent) {
            return res.json({ 
                streams: [{
                    name: 'No Torrent Available',
                    title: `⚠️ No torrent available for ${episode.arc.title} - Part ${episode.part}`,
                    url: '',
                    behaviorHints: {
                        notWebReady: true
                    }
                }]
            });
        }

        // For now, return a placeholder with episode info while we test
        return res.json({ 
            streams: [{
                name: `TorBox - ${episode.arc.title}`,
                title: `📺 ${episode.arc.title} - Part ${episode.part}\n📖 Manga chapters: ${episode.manga}\n⚠️ TorBox integration in progress...`,
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: `onepace-${episodeId}`
                }
            }]
        });

        // TODO: Implement actual TorBox integration once basic functionality is confirmed
        /*
        try {
            const magnetLink = episode.torrent;
            
            // Add torrent to TorBox
            const torrentResult = await addTorrentToTorBox(magnetLink, apiKey);
            
            if (torrentResult.success) {
                const torrentId = torrentResult.torrent_id;
                
                // Get torrent info to find video files
                const torrentInfo = await getTorrentInfo(torrentId, apiKey);
                
                const streams = [];
                
                if (torrentInfo.data && torrentInfo.data.length > 0) {
                    const torrent = torrentInfo.data[0];
                    
                    if (torrent.files) {
                        // Find video files
                        const videoFiles = torrent.files.filter(file => 
                            file.name.match(/\.(mp4|mkv|avi|mov)$/i)
                        );
                        
                        for (const file of videoFiles) {
                            try {
                                const downloadLink = await getDownloadLink(torrentId, file.id, apiKey);
                                
                                if (downloadLink.data) {
                                    streams.push({
                                        name: `TorBox - ${file.name}`,
                                        title: `📁 ${file.name}\n💾 ${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB`,
                                        url: downloadLink.data,
                                        behaviorHints: {
                                            notWebReady: true,
                                            bingeGroup: `onepace-${episodeId}`
                                        }
                                    });
                                }
                            } catch (fileError) {
                                console.error('Error getting download link for file:', fileError);
                            }
                        }
                    }
                }
                
                res.json({ streams });
            } else {
                res.json({ streams: [] });
            }
        } catch (torboxError) {
            console.error('TorBox error:', torboxError);
            res.json({ 
                streams: [{
                    name: 'TorBox Error',
                    title: `❌ TorBox Error: ${torboxError.message}`,
                    url: '',
                    behaviorHints: {
                        notWebReady: true
                    }
                }]
            });
        }
        */
    } catch (error) {
        console.error('Error in stream route:', error);
        res.status(500).json({ 
            streams: [{
                name: 'Server Error',
                title: `❌ Server Error: ${error.message}`,
                url: '',
                behaviorHints: {
                    notWebReady: true
                }
            }]
        });
    }
});

app.get('/:config/stream/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodeId = extractEpisodeId(req.params.id);
        const apiKey = extractApiKey(req);
        
        if (!apiKey || apiKey === 'test') {
            return res.json({ 
                streams: [{
                    name: 'TorBox Setup Required',
                    title: '⚠️ Please add your TorBox API key to the addon URL\n\nGet your API key from torbox.app → Settings → API',
                    url: '',
                    behaviorHints: {
                        notWebReady: true
                    }
                }]
            });
        }

        // Fetch episode data
        const episodes = await fetchOnePaceData();
        const episode = episodes.find(ep => ep.id.toString() === episodeId);
        
        if (!episode) {
            return res.json({ 
                streams: [{
                    name: 'Episode Not Found',
                    title: `❌ Episode ${episodeId} not found in catalog`,
                    url: '',
                    behaviorHints: {
                        notWebReady: true
                    }
                }]
            });
        }

        // For now, return a placeholder with episode info while we test
        return res.json({ 
            streams: [{
                name: `TorBox - ${episode.arc.title}`,
                title: `📺 ${episode.arc.title} - Part ${episode.part}\n📖 Manga chapters: ${episode.manga}\n⚠️ TorBox integration in progress...`,
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: `onepace-${episodeId}`
                }
            }]
        });
    } catch (error) {
        console.error('Error in stream route:', error);
        res.status(500).json({ 
            streams: [{
                name: 'Server Error',
                title: `❌ Server Error: ${error.message}`,
                url: '',
                behaviorHints: {
                    notWebReady: true
                }
            }]
        });
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
