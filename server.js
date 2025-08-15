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
    version: '1.0.1',
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
                id: `${episode.id}`,
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

// API Routes
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
});

app.get('/:config?/manifest.json', (req, res) => {
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

app.get('/:config?/catalog/series/onepace.json', async (req, res) => {
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
        let episodeId = req.params.id;
        
        // Handle both onepace:ID and just ID formats
        if (episodeId.startsWith('onepace:')) {
            episodeId = episodeId.replace('onepace:', '');
        }
        
        const apiKey = req.query.torbox_api_key || req.query.api_key;
        
        if (!apiKey) {
            return res.status(400).json({ 
                error: 'TorBox API key required. Add ?torbox_api_key=YOUR_KEY to the addon URL in Stremio.' 
            });
        }

        // Fetch episode data
        const episodes = await fetchOnePaceData();
        const episode = episodes.find(ep => ep.id.toString() === episodeId);
        
        if (!episode || !episode.torrent) {
            return res.json({ streams: [] });
        }

        // Convert torrent to magnet link if needed
        let magnetLink = episode.torrent;
        if (episode.torrent.startsWith('http') && episode.torrent.includes('.torrent')) {
            // If it's a torrent file URL, we need to convert it to magnet
            // For now, we'll skip this conversion and return empty streams
            // In a full implementation, you'd fetch the torrent file and extract the magnet
            return res.json({ streams: [] });
        }

        if (!magnetLink.startsWith('magnet:')) {
            return res.json({ streams: [] });
        }

        try {
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
app.get('/:config?/stream/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        let episodeId = req.params.id;
        
        // Handle both onepace:ID and just ID formats
        if (episodeId.startsWith('onepace:')) {
            episodeId = episodeId.replace('onepace:', '');
        }
        
        // Extract API key from config or query parameters
        const config = req.params.config;
        let apiKey = req.query.torbox_api_key || req.query.api_key;
        
        // Try to extract API key from config parameter if present
        if (config && config.includes('torbox_api_key=')) {
            const match = config.match(/torbox_api_key=([^&]+)/);
            if (match) apiKey = match[1];
        }
        
        if (!apiKey) {
            return res.status(400).json({ 
                error: 'TorBox API key required. Add ?torbox_api_key=YOUR_KEY to the addon URL in Stremio.' 
            });
        }

        // Fetch episode data
        const episodes = await fetchOnePaceData();
        const episode = episodes.find(ep => ep.id.toString() === episodeId);
        
        if (!episode || !episode.torrent) {
            return res.json({ streams: [] });
        }

        // Convert torrent to magnet link if needed
        let magnetLink = episode.torrent;
        if (episode.torrent.startsWith('http') && episode.torrent.includes('.torrent')) {
            // If it's a torrent file URL, we need to convert it to magnet
            // For now, we'll skip this conversion and return empty streams
            // In a full implementation, you'd fetch the torrent file and extract the magnet
            return res.json({ streams: [] });
        }

        if (!magnetLink.startsWith('magnet:')) {
            return res.json({ streams: [] });
        }

        try {
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
                    title: `❌ Error: ${torboxError.message}`,
                    url: '',
                    behaviorHints: {
                        notWebReady: true
                    }
                }]
            });
        }
    } catch (error) {
        console.error('Error in stream route:', error);
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

app.get('/meta/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        let episodeId = req.params.id;
        
        // Handle both onepace:ID and just ID formats
        if (episodeId.startsWith('onepace:')) {
            episodeId = episodeId.replace('onepace:', '');
        }
        
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

app.get('/:config?/meta/series/:id.json', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        let episodeId = req.params.id;
        
        // Handle both onepace:ID and just ID formats
        if (episodeId.startsWith('onepace:')) {
            episodeId = episodeId.replace('onepace:', '');
        }
        
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
        version: '1.0.0',
        description: 'Stremio addon for One Pace content via TorBox',
        manifest: `${req.protocol}://${req.get('host')}/manifest.json`
    });
});

app.listen(PORT, () => {
    console.log(`One Pace TorBox Addon running on port ${PORT}`);
    console.log(`Manifest URL: http://localhost:${PORT}/manifest.json`);
    console.log('To use with TorBox, add your API key as a query parameter:');
    console.log(`http://localhost:${PORT}/manifest.json?torbox_api_key=YOUR_API_KEY`);
});

module.exports = app;
