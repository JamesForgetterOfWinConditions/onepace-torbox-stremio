# One Pace Stremio Addon with TorBox Integration

A Stremio addon that provides One Pace episodes streamed through TorBox debrid service instead of direct torrenting. This eliminates the need for local torrenting and provides faster, more reliable streaming.

## Features

- 🎬 **Complete One Pace catalog** - All released episodes automatically synced
- 🚀 **TorBox integration** - Stream through debrid service for better performance
- 📱 **Cross-platform** - Works on all Stremio-supported devices
- 🔄 **Auto-updates** - Catalog stays current with new One Pace releases
- 💾 **No local storage** - No torrents stored on your device
- 🌐 **Web-based** - Easy deployment and access

## Prerequisites

1. **TorBox Account**: Get a free account at [torbox.app](https://torbox.app)
2. **TorBox API Key**: Found in your TorBox account settings
3. **Stremio**: Download from [stremio.com](https://stremio.com)

## Quick Setup

### Option 1: Use Deployed Version (Recommended)

If someone has already deployed this addon, you can use it directly:

1. Get the addon URL (e.g., `https://your-addon-url.com/manifest.json`)
2. Add your TorBox API key: `https://your-addon-url.com/manifest.json?torbox_api_key=YOUR_API_KEY`
3. Install in Stremio by pasting the URL in the addon search

### Option 2: Deploy Your Own

#### Deploy to Vercel (Free, Recommended)

1. Fork this repository
2. Connect to Vercel and deploy
3. Your addon will be available at `https://your-vercel-app.vercel.app/manifest.json`

#### Deploy to Railway

1. Connect your GitHub repo to Railway
2. Deploy with one click
3. Your addon will be available at `https://your-app.railway.app/manifest.json`

#### Deploy with Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/onepace-torbox-stremio.git
cd onepace-torbox-stremio

# Build and run with Docker Compose
docker-compose up -d

# Your addon will be available at http://localhost:3000/manifest.json
```

#### Local Development

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/onepace-torbox-stremio.git
cd onepace-torbox-stremio
npm install

# Start the server
npm run dev

# Your addon will be available at http://localhost:3000/manifest.json
```

## Installation in Stremio

1. Open Stremio and go to **Addons**
2. Click **Search addons** 
3. Paste your addon URL with API key:
   ```
   https://your-addon-url.com/manifest.json?torbox_api_key=YOUR_TORBOX_API_KEY
   ```
4. Click **Install**
5. The addon will sync across all your Stremio devices

## How It Works

1. **Catalog**: The addon fetches the latest One Pace episodes from their GraphQL API
2. **Stream Request**: When you select an episode, it:
   - Gets the torrent/magnet link from One Pace
   - Adds it to your TorBox account
   - Returns streaming links from TorBox
3. **Playback**: Stremio streams directly from TorBox's servers

## TorBox Integration Details

This addon integrates with TorBox's API to:
- Add torrents to your TorBox account automatically
- Retrieve download links for streaming
- Handle multiple video files within torrents
- Provide file size information

TorBox provides torrent streams with zero config, and a free account allows you to instantly start watching your favorite torrents.

## Configuration

### API Key Management

The addon requires your TorBox API key to function. You can provide it in two ways:

1. **Query Parameter** (Recommended):
   ```
   https://your-addon.com/manifest.json?torbox_api_key=YOUR_KEY
   ```

2. **Environment Variable** (For self-hosting):
   ```bash
   export TORBOX_API_KEY=your_key_here
   ```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `TORBOX_API_KEY` - Your TorBox API key (optional, can be provided via URL)

## API Endpoints

- `GET /manifest.json` - Stremio addon manifest
- `GET /catalog/series/onepace.json` - One Pace episode catalog
- `GET /stream/series/:id.json` - Streaming links for specific episode
- `GET /meta/series/:id.json` - Episode metadata

## Troubleshooting

### Common Issues

1. **No streams available**: Check your TorBox API key and account status
2. **Slow loading**: TorBox might be processing the torrent for the first time
3. **Playback issues**: Ensure your TorBox account has sufficient bandwidth

### Error Messages

- `TorBox API key required` - Add your API key to the addon URL
- `TorBox API error: 401` - Invalid API key
- `TorBox API error: 429` - Rate limit exceeded, try again later

## Development

### Project Structure

```
├── server.js          # Main addon server
├── package.json       # Dependencies and scripts  
├── Dockerfile         # Docker configuration
├── docker-compose.yml # Docker Compose setup
├── vercel.json        # Vercel deployment config
├── railway.json       # Railway deployment config
└── README.md          # This file
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Legal Notice

This addon is for educational purposes and personal use only. Users are responsible for complying with their local laws regarding content streaming and copyright. The addon only facilitates access to content already available through One Pace's official releases.

## Credits

- **One Pace Team** - For creating the amazing One Pace project
- **TorBox** - For providing the debrid service
- **Original Addon Authors** - au2001, fedew04, vasujain275, roshank231, trulow
- **Stremio** - For the excellent media center platform

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/onepace-torbox-stremio/issues)
- **TorBox Support**: [TorBox Help Center](https://support.torbox.app)
- **One Pace Updates**: [Matrix Channel](https://matrix.to/#/#onepace:garnier.dev)
