# better-wait-until

A better waitUntil utility for Cloudflare Workers.

## Installation

```bash
npm install better-wait-until
```

## Usage

```typescript
import { waitUntil } from 'better-wait-until';

// Use in your Cloudflare Worker
await waitUntil(someAsyncOperation());
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build
```

## Publishing

This package uses GitHub Actions to automatically publish to npm when a new release is created.

### Setup Instructions

1. **Create an npm access token**:
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token

2. **Add the token to GitHub Secrets**:
   - Go to https://github.com/eastlondoner/better-wait-until/settings/secrets/actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: paste your npm token
   - Click "Add secret"

3. **Create a release**:
   - Go to https://github.com/eastlondoner/better-wait-until/releases
   - Click "Create a new release"
   - Create a new tag (e.g., `v0.1.0`)
   - Publish the release
   - The GitHub Action will automatically build and publish to npm

## License

MIT

