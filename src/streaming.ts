/**
 * Playwright DOM Streaming functionality
 */

export interface StreamOptions {
  port?: number;
  interval?: number;
  headless?: boolean;
  automationEnabled?: boolean;
}

export interface StreamCommand {
  type: 'click' | 'input' | 'navigate' | 'type' | 'press';
  data: {
    selector?: string;
    value?: string;
    url?: string;
    key?: string;
    text?: string;
    direction?: 'back' | 'forward';
  };
}

export interface QuantumStream {
  close: () => Promise<void>;
  page: any;
  automate: (fn: (page: any) => Promise<void>) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  click: (selector: string) => Promise<void>;
  type: (selector: string, text: string) => Promise<void>;
  waitForSelector: (selector: string, options?: any) => Promise<void>;
  evaluate: <T>(pageFunction: ((...args: any[]) => T) | string, ...args: any[]) => Promise<T>;
  screenshot: (options?: any) => Promise<Buffer>;
}

/**
 * Creates a browser streaming server using Playwright
 */
export async function createQuantumStream(
  url: string,
  options: StreamOptions = {}
): Promise<QuantumStream> {
  const { chromium } = await import('playwright');
  const WebSocketLib = await import('ws');
  
  const port = options.port || 8080;
  const interval = options.interval || 500;
  const headless = options.headless !== undefined ? options.headless : false;
  
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  await page.goto(url);
  
  // Wait for the initial page load
  await page.waitForLoadState('networkidle').catch(() => {});
  
  const wss = new WebSocketLib.Server({ port });
  console.log(`WebSocket server running on ws://localhost:${port}`);
  
  const clients = new Set<any>();
  
  wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);
    
    // Send initial DOM and navigation state with a slight delay
    setTimeout(async () => {
      await sendDOM(ws, page);
      await sendNavigationState(ws, page);
    }, 1000);
    
    ws.on('message', async (message) => {
      try {
        const command = JSON.parse(message.toString()) as StreamCommand;
        await handleCommand(page, command, ws);
      } catch (error) {
        console.error('Error handling command:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected');
      clients.delete(ws);
    });
  });
  
  // Stream updates at the specified interval
  const intervalID = setInterval(async () => {
    if (!page.isClosed()) {
      for (const client of clients) {
        if (client.readyState === WebSocketLib.WebSocket.OPEN) {
          await sendDOM(client, page);
          await sendNavigationState(client, page);
        }
      }
    }
  }, interval);
  
  return {
    close: async () => {
      clearInterval(intervalID);
      wss.close();
      await browser.close();
    },
    page,
    automate: async (fn: (page: any) => Promise<void>) => {
      await fn(page);
    },
    navigate: async (url: string) => {
      await page.goto(url);
    },
    click: async (selector: string) => {
      await page.click(selector);
    },
    type: async (selector: string, text: string) => {
      await page.type(selector, text);
    },
    waitForSelector: async (selector: string, options?: any) => {
      await page.waitForSelector(selector, options);
    },
    evaluate: async <T>(pageFunction: ((...args: any[]) => T) | string, ...args: any[]) => {
      return await page.evaluate(pageFunction, ...args);
    },
    screenshot: async (options?: any) => {
      return await page.screenshot(options);
    }
  };
}

/**
 * Sends the current DOM to a WebSocket client
 */
async function sendDOM(ws: any, page: any): Promise<void> {
  try {
    // Check if page is still navigating
    const isNavigating = await page.evaluate(() => document.readyState !== 'complete');
    if (isNavigating) {
      // Skip sending DOM while page is loading
      return;
    }

    // Wait for network idle with a shorter timeout
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: 2000 }),
      page.waitForTimeout(1000)
    ]).catch(() => {});
    
    // Double check if page is still available and not navigating
    if (!page.isClosed() && !(await page.evaluate(() => document.readyState !== 'complete'))) {
      // Get the page URL for rewriting relative paths
      const pageUrl = page.url();
      const baseUrl = new URL(pageUrl).origin;

      // Get the DOM content with a timeout
      const dom = await Promise.race([
        page.content(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Content retrieval timeout')), 2000))
      ]) as string;

      // Only proceed if we got valid content
      if (dom && typeof dom === 'string') {
        // Rewrite relative URLs to absolute
        const modifiedDom = dom
          .replace(/(href|src)=["']\/([^"']*?)["']/g, `$1="${baseUrl}/$2"`)
          .replace(/(href|src)=["'](?!http|\/\/)([^"']*?)["']/g, `$1="${baseUrl}/$2"`);

        // Send the modified DOM
        ws.send(JSON.stringify({ type: 'dom', data: modifiedDom }));

        // Get styles only if page is still stable
        if (!page.isClosed() && !(await page.evaluate(() => document.readyState !== 'complete'))) {
          const styles = await page.evaluate(() => {
            return Array.from(document.styleSheets).map(sheet => {
              try {
                return {
                  href: sheet.href,
                  rules: sheet.cssRules ? Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n') : ''
                };
              } catch (e) {
                return { href: sheet.href, rules: '' };
              }
            });
          });

          ws.send(JSON.stringify({ 
            type: 'styles', 
            data: styles 
          }));
        }
      }
    }
  } catch (error) {
    // Only log error if it's not a navigation-related error
    if (!error.message?.includes('navigating') && !error.message?.includes('timeout')) {
      console.error('Error sending DOM:', error);
    }
  }
}

/**
 * Sends the current navigation state to a WebSocket client
 */
async function sendNavigationState(ws: any, page: any): Promise<void> {
  try {
    if (!page.isClosed()) {
      const canGoBack = await page.evaluate(() => window.history.length > 1 && window.history.state !== null);
      const canGoForward = await page.evaluate(() => window.history.length > 1 && window.history.state !== null && window.history.state.forward);
      
      ws.send(JSON.stringify({
        type: 'navigationState',
        data: {
          canGoBack,
          canGoForward
        }
      }));
    }
  } catch (error) {
    console.error('Error sending navigation state:', error);
  }
}

/**
 * Handles commands from the client
 */
async function handleCommand(page: any, command: StreamCommand, ws: any): Promise<void> {
  const { type, data } = command;
  
  try {
    switch (type) {
      case 'click':
        if (data.selector) {
          // Wait for element to be visible and stable
          await page.waitForSelector(data.selector, { state: 'visible', timeout: 5000 }).catch(() => {});
          
          // Try to scroll element into view first
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, data.selector);

          // Wait a bit for scroll to complete
          await page.waitForTimeout(500);

          // Click with retry
          await page.click(data.selector, {
            force: true, // Try to click even if element is covered
            timeout: 5000,
            delay: 100 // Add small delay between mousedown and mouseup
          });

          // Wait for any navigation or network activity to settle
          await Promise.race([
            page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}),
            page.waitForTimeout(1000)
          ]);
        }
        break;

      case 'type':
        if (data.selector && data.text) {
          // Wait for element to be ready
          await page.waitForSelector(data.selector, { state: 'visible', timeout: 5000 });
          
          // Focus the element
          await page.focus(data.selector);
          
          // Type the text with a natural delay
          await page.type(data.selector, data.text, { delay: 50 });
        }
        break;

      case 'press':
        if (data.key) {
          // Press a specific key (like Enter, Tab, etc)
          await page.keyboard.press(data.key);
        }
        break;

      case 'input':
        if (data.selector && data.value !== undefined) {
          // Wait for element and clear it first
          await page.waitForSelector(data.selector, { state: 'visible', timeout: 5000 });
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, data.selector);
          
          // Focus and clear the field
          await page.focus(data.selector);
          await page.keyboard.down('Control');
          await page.keyboard.press('A');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          
          // Type the new value with a natural delay
          await page.type(data.selector, data.value, { delay: 50 });
        }
        break;

      case 'navigate':
        if (data.direction) {
          // Send loading state
          ws.send(JSON.stringify({ type: 'navigationState', data: { isLoading: true } }));

          // Handle back/forward navigation
          if (data.direction === 'back') {
            await page.goBack({
              waitUntil: 'domcontentloaded',
              timeout: 30000
            }).catch((err) => console.error('Navigation error:', err));
          } else if (data.direction === 'forward') {
            await page.goForward({
              waitUntil: 'domcontentloaded',
              timeout: 30000
            }).catch((err) => console.error('Navigation error:', err));
          }

          // Wait for initial content to be available
          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          
          // Send initial content
          await sendDOM(ws, page);

          // Wait for full load in background
          Promise.race([
            page.waitForLoadState('networkidle', { timeout: 10000 }),
            page.waitForTimeout(2000)
          ]).then(() => {
            sendDOM(ws, page);
            sendNavigationState(ws, page);
          }).catch(() => {});

        } else if (data.url) {
          // Send loading state
          ws.send(JSON.stringify({ type: 'navigationState', data: { isLoading: true } }));

          // Handle URL navigation
          const url = data.url.startsWith('http') ? data.url : `https://${data.url}`;
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          }).catch((err) => console.error('Navigation error:', err));

          // Wait for initial content to be available
          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          
          // Send initial content
          await sendDOM(ws, page);

          // Wait for full load in background
          Promise.race([
            page.waitForLoadState('networkidle', { timeout: 10000 }),
            page.waitForTimeout(2000)
          ]).then(() => {
            sendDOM(ws, page);
            sendNavigationState(ws, page);
          }).catch(() => {});
        }
        break;

      default:
        console.warn(`Unknown command type: ${type}`);
    }
  } catch (error) {
    console.error(`Error executing ${type} command:`, error);
    // Send error state to client
    ws.send(JSON.stringify({ 
      type: 'error', 
      data: { message: `Error executing ${type} command` } 
    }));
  }
}

/**
 * Creates a client-side connector for the DOM stream
 */
export function createStreamClient(
  wsUrl: string,
  targetElement: string | HTMLElement
): { 
  connect: () => any;
  sendCommand: (command: StreamCommand) => void;
} {
  let ws: any = null;
  let element: HTMLElement | null = null;
  
  // Get the target element
  if (typeof targetElement === 'string') {
    element = document.querySelector(targetElement) as HTMLElement;
  } else {
    element = targetElement;
  }
  
  if (!element) {
    throw new Error('Target element not found');
  }

  // Handle keyboard events
  const handleKeyboardEvent = (event: KeyboardEvent, type: 'type' | 'press') => {
    const target = event.target as HTMLElement;
    if (!target || !('tagName' in target)) return;

    // Only handle keyboard events on input elements
    if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

    // Get the selector for the target element
    const selector = getUniqueSelector(target);
    if (!selector) return;

    if (type === 'type') {
      // For regular typing, send the character
      if (event.key.length === 1) {
        sendCommand({
          type: 'type',
          data: {
            selector,
            text: event.key
          }
        });
      }
    } else if (type === 'press') {
      // For special keys like Enter, Tab, etc
      if (event.key.length > 1) {
        sendCommand({
          type: 'press',
          data: {
            key: event.key
          }
        });
      }
    }
  };

  // Helper function to get a unique selector for an element
  const getUniqueSelector = (el: Element): string | null => {
    if (el.id) {
      return `#${el.id}`;
    }

    // Try to build a unique selector using classes and attributes
    const parts: string[] = [];
    let current = el;
    
    while (current && current !== document.body) {
      let part = current.tagName.toLowerCase();
      
      if (current.className && typeof current.className === 'string') {
        part += '.' + current.className.trim().replace(/\s+/g, '.');
      }
      
      // Add position if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-child(${index})`;
        }
      }
      
      parts.unshift(part);
      current = current.parentElement as Element;
    }
    
    return parts.join(' > ');
  };
  
  const connect = (): any => {
    ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event: any) => {
      try {
        const { type, data } = JSON.parse(event.data);
        
        if (type === 'dom' && element) {
          // Check if element is an iframe
          if (element.tagName === 'IFRAME') {
            const iframe = element as HTMLIFrameElement;
            if (iframe.contentDocument) {
              iframe.contentDocument.open();
              iframe.contentDocument.write(data);
              iframe.contentDocument.close();

              // Add base tag to handle relative URLs
              const base = iframe.contentDocument.createElement('base');
              base.href = new URL(iframe.contentDocument.location.href).origin + '/';
              iframe.contentDocument.head.insertBefore(base, iframe.contentDocument.head.firstChild);

              // Add keyboard event listeners to the iframe
              iframe.contentDocument.addEventListener('keydown', (e) => handleKeyboardEvent(e, 'press'));
              iframe.contentDocument.addEventListener('keypress', (e) => handleKeyboardEvent(e, 'type'));
            }
          } else {
            // Otherwise, use innerHTML
            element.innerHTML = data;

            // Add keyboard event listeners
            element.addEventListener('keydown', (e) => handleKeyboardEvent(e, 'press'));
            element.addEventListener('keypress', (e) => handleKeyboardEvent(e, 'type'));
          }
        } else if (type === 'styles') {
          // Apply any dynamically loaded styles
          const doc = element.tagName === 'IFRAME' 
            ? (element as HTMLIFrameElement).contentDocument 
            : document;

          if (doc) {
            data.forEach((style: any) => {
              if (style.rules) {
                const styleEl = doc.createElement('style');
                styleEl.textContent = style.rules;
                doc.head.appendChild(styleEl);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('Connection closed');
    };
    
    ws.onerror = (error: any) => {
      console.error('WebSocket error:', error);
    };
    
    return ws;
  };
  
  const sendCommand = (command: StreamCommand): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(command));
    } else {
      console.error('WebSocket not connected');
    }
  };
  
  return {
    connect,
    sendCommand
  };
} 