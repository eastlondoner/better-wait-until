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

## License

MIT

