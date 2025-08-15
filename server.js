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

// In-memory cache for torrent processing
const torrentCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Manifest for the addon
const manifest = {
    id: 'com.onepace.torbox',
    version: '1.0.4',
    name: 'One Pace (TorBox)',
    description: 'One Pace episodes streamed through TorBox debrid service',
    logo: 'https://onepace.net/images/logo.png',
    resources: ['catalog', 'stream', 'meta'],
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'onepace-torbox',
            name: 'One Pace',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        }
    ],
    idPrefixes: ['onepace'],
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

    console.log(`TorBox API Request: ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
        ...options,
        headers,
        timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`TorBox API Error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`TorBox API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function addTorrentToTorBox(magnetLink, apiKey) {
    try {
        // Check if we already have this torrent cached
        const cacheKey = `torrent_${magnetLink}`;
        const cached = torrentCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('Using cached torrent data');
            return cached.data;
        }

        const result = await torboxRequest('/torrents/createtorrent', {
            method: 'POST',
            body: JSON.stringify({
                magnet: magnetLink,
                seed: 1 // Keep seeding
            })
        }, apiKey);

        // Cache the result
        torrentCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

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
        // Use the correct endpoint format
        const result = await torboxRequest(`/torrents/requestdl?torrent_id=${torrentId}&file_id=${fileId}`, {
            method: 'GET'
        }, apiKey);
        return result;
    } catch (error) {
        console.error('Error getting download link:', error);
        throw error;
    }
}

async function waitForTorrentReady(torrentId, apiKey, maxWaitTime = 60000) {
    const startTime = Date.now();
    const checkInterval = 3000; // Check every 3 seconds

    while (Date.now() - startTime < maxWaitTime) {
        try {
            const torrentInfo = await getTorrentInfo(torrentId, apiKey);
            
            if (torrentInfo.data && torrentInfo.data.length > 0) {
                const torrent = torrentInfo.data[0];
                
                // Check if torrent is ready (downloaded or cached)
                if (torrent.download_state === 'downloaded' || 
                    torrent.download_state === 'cached' ||
                    torrent.download_finished === true) {
                    return torrent;
                }
                
                console.log(`Torrent ${torrentId} status: ${torrent.download_state}, progress: ${torrent.progress}%`);
            }
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        } catch (error) {
            console.error('Error checking torrent status:', error);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    }
    
    throw new Error('Torrent not ready within timeout period');
}

// One Pace data fetching functions
async function fetchOnePaceData() {
    try {
        console.log('Fetching One Pace data...');
        
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
                }),
                timeout: 10000
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.data && data.data.episodes) {
                    console.log(`Fetched ${data.data.episodes.length} episodes from GraphQL API`);
                    return data.data.episodes;
                }
            }
        } catch (graphqlError) {
            console.log('GraphQL API not available, using fallback data:', graphqlError.message);
        }

        // Enhanced fallback with more realistic data structure
        console.log('Using fallback episode data');
        return [
            {
                id: 1,
                title: "Romance Dawn 01",
                arc: { title: "Romance Dawn" },
                part: 1,
                manga: "1-7",
                released: "2014-03-16T00:00:00Z",
                torrent: null // Will be populated when real API is available
            },
            {
                id: 2,
                title: "Orange Town 01",
                arc: { title: "Orange Town" },
                part: 1,
                manga: "8-21",
                released: "2014-03-20T00:00:00Z",
                torrent: null
            },
            {
                id: 3,
                title: "Syrup Village 01",
                arc: { title: "Syrup Village" },
                part: 1,
                manga: "22-41",
                released: "2014-04-01T00:00:00Z",
                torrent: null
            },
            {
                id: 4,
                title: "Baratie 01",
                arc: { title: "Baratie" },
                part: 1,
                manga: "42-68",
                released: "2014-04-15T00:00:00Z",
                torrent: null
            },
            {
                id: 5,
                title: "Arlong Park 01",
                arc: { title: "Arlong Park" },
                part: 1,
                manga: "69-95",
                released: "2014-05-01T00:00:00Z",
                torrent: null
            }
        ];
    } catch (error) {
        console.error('Error fetching One Pace data:', error);
        return [];
    }
}

function formatEpisodeData(episodes) {
    const metas = [];

    episodes.forEach((episode, index) => {
        if (episode.released) {
            metas.push({
                id: `onepace${episode.id}`,
                type: 'series',
                name: `One Pace: ${episode.arc.title}`,
                poster: 'https://images.justwatch.com/poster/244890632/s718/one-piece.jpg',
                background: 'https://images.justwatch.com/backdrop/177834441/s1920/one-piece.jpg',
                description: `${episode.arc.title} - Part ${episode.part}\nManga chapters: ${episode.manga}`,
                releaseInfo: new Date(episode.released).getFullYear().toString(),
                imdbRating: '8.9',
                genres: ['Animation', 'Adventure', 'Comedy'],
                videos: [{
                    id: `onepace${episode.id}:1:1`,
                    title: `${episode.arc.title} - Part ${episode.part}`,
                    overview: `Manga chapters: ${episode.manga}`,
                    episode: 1,
                    season: 1,
                    released: new Date(episode.released).toISOString(),
                    thumbnail: 'https://images.justwatch.com/poster/244890632/s718/one-piece.jpg'
                }]
            });
        }
    });

    return metas;
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
    
    // Try environment variable as last resort
    if (!apiKey) {
        apiKey = process.env.TORBOX_API_KEY;
    }
    
    return apiKey;
}

// Helper function to extract episode ID
function extractEpisodeId(id) {
    if (id.startsWith('onepace')) {
        const cleanId = id.replace('onepace', '').split(':')[0];
        return cleanId;
    }
    return id;
}

// Enhanced stream processing function
async function processStreamRequest(episodeId, apiKey) {
    console.log(`Processing stream request for episode ${episodeId}`);
    
    if (!apiKey || apiKey === 'test') {
        return [{
            name: 'TorBox Setup Required',
            title: '⚠️ Please add your TorBox API key to the addon URL\n\nGet your API key from torbox.app → Settings → API',
            url: '',
            behaviorHints: { notWebReady: true }
        }];
    }

    // Fetch episode data
    const episodes = await fetchOnePaceData();
    const episode = episodes.find(ep => ep.id.toString() === episodeId);
    
    if (!episode) {
        return [{
            name: 'Episode Not Found',
            title: `❌ Episode ${episodeId} not found in catalog`,
            url: '',
            behaviorHints: { notWebReady: true }
        }];
    }

    if (!episode.torrent) {
        return [{
            name: 'No Torrent Available',
            title: `⚠️ No torrent available for ${episode.arc.title} - Part ${episode.part}\n\nThis may be because:\n• Episode not yet released\n• GraphQL API unavailable\n• Using fallback data`,
            url: '',
            behaviorHints: { notWebReady: true }
        }];
    }

    try {
        console.log(`Processing torrent for ${episode.arc.title} - Part ${episode.part}`);
        const magnetLink = episode.torrent;
        
        // Add torrent to TorBox
        const torrentResult = await addTorrentToTorBox(magnetLink, apiKey);
        console.log('Torrent add result:', torrentResult);
        
        if (!torrentResult.success) {
            throw new Error('Failed to add torrent to TorBox');
        }

        const torrentId = torrentResult.torrent_id;
        console.log(`Torrent ID: ${torrentId}`);
        
        // Wait for torrent to be ready or use cached version
        let torrent;
        try {
            torrent = await waitForTorrentReady(torrentId, apiKey, 30000); // 30 second timeout
        } catch (waitError) {
            console.log('Torrent not immediately ready, checking current status...');
            const torrentInfo = await getTorrentInfo(torrentId, apiKey);
            if (torrentInfo.data && torrentInfo.data.length > 0) {
                torrent = torrentInfo.data[0];
            } else {
                throw waitError;
            }
        }

        const streams = [];
        
        if (torrent && torrent.files) {
            console.log(`Found ${torrent.files.length} files in torrent`);
            
            // Find video files (prioritize larger files and common video formats)
            const videoFiles = torrent.files
                .filter(file => file.name.match(/\.(mp4|mkv|avi|mov|m4v|webm)$/i))
                .sort((a, b) => b.size - a.size); // Sort by size, largest first

            console.log(`Found ${videoFiles.length} video files`);

            for (const file of videoFiles.slice(0, 3)) { // Limit to top 3 files
                try {
                    console.log(`Getting download link for file: ${file.name}`);
                    const downloadLink = await getDownloadLink(torrentId, file.id, apiKey);
                    
                    if (downloadLink.success && downloadLink.data) {
                        const sizeGB = (file.size / 1024 / 1024 / 1024).toFixed(2);
                        
                        streams.push({
                            name: `TorBox - ${episode.arc.title}`,
                            title: `📺 ${file.name}\n💾 ${sizeGB} GB\n⚡ Quality: ${getQualityFromFilename(file.name)}`,
                            url: downloadLink.data,
                            behaviorHints: {
                                notWebReady: false,
                                bingeGroup: `onepace-${episodeId}`
                            }
                        });
                    }
                } catch (fileError) {
                    console.error(`Error getting download link for file ${file.name}:`, fileError);
                }
            }
        }
        
        // If no streams found but torrent exists, provide status info
        if (streams.length === 0) {
            const status = torrent ? torrent.download_state : 'unknown';
            const progress = torrent ? torrent.progress : 0;
            
            streams.push({
                name: `TorBox - ${episode.arc.title}`,
                title: `⏳ Processing torrent...\n📊 Status: ${status}\n📈 Progress: ${progress}%\n\nTry again in a few minutes`,
                url: '',
                behaviorHints: { notWebReady: true }
            });
        }
        
        return streams;
        
    } catch (torboxError) {
        console.error('TorBox error:', torboxError);
        return [{
            name: 'TorBox Error',
            title: `❌ TorBox Error: ${torboxError.message}\n\nPlease check:\n• Your API key is valid\n• Your TorBox account is active\n• The torrent is accessible`,
            url: '',
            behaviorHints: { notWebReady: true }
        }];
    }
}

// Helper function to determine quality from filename
function getQualityFromFilename(filename) {
    if (filename.match(/1080p|1920x1080/i)) return '1080p';
    if (filename.match(/720p|1280x720/i)) return '720p';
    if (filename.match(/480p|854x480/i)) return '480p';
    if (filename.match(/4k|2160p/i)) return '4K';
    return 'Unknown';
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

app.get('/catalog/series/onepace-torbox.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodes = await fetchOnePaceData();
        const metas = formatEpisodeData(episodes);
        
        res.json({ metas: metas });
    } catch (error) {
        console.error('Error in catalog route:', error);
        res.status(500).json({ error: 'Failed to fetch catalog' });
    }
});

app.get('/:config/catalog/series/onepace-torbox.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodes = await fetchOnePaceData();
        const metas = formatEpisodeData(episodes);
        
        res.json({ metas: metas });
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
        
        const streams = await processStreamRequest(episodeId, apiKey);
        res.json({ streams });
        
    } catch (error) {
        console.error('Error in stream route:', error);
        res.status(500).json({ 
            streams: [{
                name: 'Server Error',
                title: `❌ Server Error: ${error.message}`,
                url: '',
                behaviorHints: { notWebReady: true }
            }]
        });
    }
});

app.get('/:config/stream/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const episodeId = extractEpisodeId(req.params.id);
        const apiKey = extractApiKey(req);
        
        const streams = await processStreamRequest(episodeId, apiKey);
        res.json({ streams });
        
    } catch (error) {
        console.error('Error in stream route:', error);
        res.status(500).json({ 
            streams: [{
                name: 'Server Error',
                title: `❌ Server Error: ${error.message}`,
                url: '',
                behaviorHints: { notWebReady: true }
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
            id: `onepace${episodeId}`,
            type: 'series',
            name: `One Pace: ${episode.arc.title}`,
            poster: 'https://images.justwatch.com/poster/244890632/s718/one-piece.jpg',
            background: 'https://images.justwatch.com/backdrop/177834441/s1920/one-piece.jpg',
            description: `${episode.arc.title} - Part ${episode.part}\nManga chapters: ${episode.manga}\nReleased: ${new Date(episode.released).toLocaleDateString()}`,
            releaseInfo: new Date(episode.released).getFullYear().toString(),
            imdbRating: '8.9',
            genres: ['Animation', 'Adventure', 'Comedy'],
            videos: [{
                id: `onepace${episodeId}:1:1`,
                title: `${episode.arc.title} - Part ${episode.part}`,
                overview: `Manga chapters: ${episode.manga}`,
                episode: 1,
                season: 1,
                released: new Date(episode.released).toISOString(),
                thumbnail: 'https://images.justwatch.com/poster/244890632/s718/one-piece.jpg'
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
            id: `onepace${episodeId}`,
            type: 'series',
            name: `One Pace: ${episode.arc.title}`,
            poster: 'https://onepace.net/images/logo.png',
            background: 'https://images.justwatch.com/backdrop/177834441/s1920/one-piece.jpg',
            description: `${episode.arc.title} - Part ${episode.part}\nManga chapters: ${episode.manga}\nReleased: ${new Date(episode.released).toLocaleDateString()}`,
            releaseInfo: new Date(episode.released).getFullYear().toString(),
            videos: [{
                id: `onepace${episodeId}:1:1`,
                title: `${episode.arc.title} - Part ${episode.part}`,
                overview: `Manga chapters: ${episode.manga}`,
                episode: 1,
                season: 1,
                released: new Date(episode.released).toISOString(),
                thumbnail: 'https://onepace.net/images/logo.png'
            }]
        };

        res.json({ meta });
    } catch (error) {
        console.error('Error in meta route:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'One Pace TorBox Addon',
        version: manifest.version,
        description: 'Stremio addon for One Pace content via TorBox',
        manifest: `${req.protocol}://${req.get('host')}/manifest.json`,
        status: 'online',
        endpoints: {
            manifest: '/manifest.json',
            catalog: '/catalog/series/onepace-torbox.json',
            stream: '/stream/series/{id}.json',
            meta: '/meta/series/{id}.json'
        }
    });
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        cache_size: torrentCache.size
    });
});

// Debug endpoint (for development)
app.get('/debug/cache', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({
        cache_entries: Array.from(torrentCache.keys()),
        cache_size: torrentCache.size
    });
});

// For local development
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`One Pace TorBox Addon running on port ${PORT}`);
        console.log(`Manifest URL: http://localhost:${PORT}/manifest.json`);
        console.log(`With API key: http://localhost:${PORT}/manifest.json?torbox_api_key=YOUR_KEY`);
    });
}

module.exports = app;
