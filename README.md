# QuantumView

> 🚀 Observe and control browser automation with quantum-like precision.

QuantumView brings real-time browser streaming to Playwright, enabling simultaneous observation and control without affecting the automation state - like quantum observation without collapse. Stream browser interactions and page changes in real-time between a Playwright instance and a client, maintaining perfect sync with your automation.


https://github.com/user-attachments/assets/5664b4d3-458d-403a-ae7b-d97e006ecc0d



## Why QuantumView?

Live streaming for Playwright exists, but it often comes with significant tradeoffs:
- 🔒 Infrastructure lock-in that takes control of your browser state
- 🏗️ Complex setup requirements
- 🔗 Tight coupling with specific automation strategies

QuantumView takes a quantum leap forward:
- 🎯 Non-intrusive observation that doesn't affect your automation state
- 🔄 Perfect synchronization between automation and observation
- 🔓 No lock-in - host it yourself or integrate with existing infrastructure
- 🤝 Works alongside your existing Playwright scripts
- 🎮 Full control over your browser automation strategy

## Current Status: Work in Progress

> ⚠️ This project is currently in early development. The core streaming functionality works, but the API is not yet stable.

### What Works Now (Kind of)
- ✅ Real-time browser streaming via WebSocket
- ✅ Bidirectional communication
- ✅ Navigation support (including back/forward)
- ✅ Click and input handling
- ✅ Dynamic content updates
- ✅ Style synchronization
- ✅ Loading states and error handling

### Coming Soon
- 🔄 Stable API for production use
- 📦 NPM package
- 🔌 Easy integration with existing Playwright scripts
- 🎨 Customizable streaming options
- 📊 Performance monitoring
- 🔐 Security features

## Use Cases

### Human-in-the-Loop Workflows
- Real-time monitoring of automation
- Interactive debugging
- Manual intervention when needed
- Training data collection

### Debugging & Monitoring
- Watch automation in real-time
- Debug complex workflows
- Monitor long-running processes
- Capture and analyze issues

### Interactive Flows
- Handle complex authentication
- Deal with CAPTCHAs
- Manage user verification steps
- Interactive form filling

## Quick Start

> Note: This is a preview of the functionality. API may change.

### Running the Demo

```bash
# Clone the repository
git clone https://github.com/bigboateng/quantumview.git
cd quantumview

# Install dependencies
npm install

# Build the library
npm run build

# Start the streaming server (in one terminal)
cd examples
node test-server.js

# Open test-client.html in your browser to see the stream
```

### Integration Example

```typescript
import { createQuantumStream } from 'quantumview';
import { chromium } from 'playwright';

async function runAutomation() {
  // Create a streaming server
  const stream = await createQuantumStream('https://example.com', {
    port: 8080,
    headless: false
  });

  // Use the page object for automation while streaming
  const { page, automate } = stream;

  // Regular Playwright automation
  await page.goto('https://example.com');
  await page.fill('#search', 'query');
  await page.click('#submit');

  // Use the automate helper for actions that need streaming sync
  await automate(async (page) => {
    await page.click('.complex-workflow');
    // Actions inside automate will automatically sync with the stream
  });

  // Clean up
  await stream.close();
}
```

### Client-Side Integration

```typescript
import { createStreamClient } from 'quantumview';

// Create a client connection
const client = createStreamClient('ws://localhost:8080', '#content');
const ws = client.connect();

// Handle streaming events
ws.addEventListener('message', (event) => {
  const { type, data } = JSON.parse(event.data);
  // Handle updates...
});

// Send commands to the automation
client.sendCommand({
  type: 'navigate',
  data: { url: 'https://example.com' }
});
```

## Future Plans

1. **SDK Development**
   - Stable API for production use
   - Comprehensive documentation
   - TypeScript types and schemas
   - Integration examples

2. **Hosting Options**
   - Self-hosted solution
   - Docker containers
   - Cloud deployment guides
   - Load balancing support

3. **Integration Features**
   - Playwright test runner integration
   - CI/CD pipeline examples
   - Custom event handlers
   - Middleware support

4. **Advanced Features**
   - Network traffic monitoring
   - Console log streaming
   - Performance metrics
   - Screenshot and video capture
   - Custom state observation strategies

## Contributing

This project is in active development. Contributions, ideas, and feedback are welcome! Feel free to:
- Open issues for bugs or feature requests
- Submit pull requests
- Share your use cases and requirements
- Join the discussion

## License

MIT 
