// Load in our dependencies
const ContextKarma = require('./karma')

// Resolve our parent window
const parentWindow = window.opener || window.parent

// Define a remote call method for Karma
let callParentKarmaMethod = ContextKarma.getDirectCallParentKarmaMethod(parentWindow)

// If we don't have access to the window, then use `postMessage`
// DEV: In Electron, we don't have access to the parent window due to it being in a separate process
// DEV: We avoid using this in Internet Explorer as they only support strings
//   https://caniuse.com/?search=postmessage
let haveParentAccess = false
try { haveParentAccess = !!parentWindow.window } catch (err) { /* Ignore errors (likely permission errors) */ }
if (!haveParentAccess) {
  callParentKarmaMethod = ContextKarma.getPostMessageCallParentKarmaMethod(parentWindow)
}

// Define a window-scoped Karma
window.__karma__ = new ContextKarma(callParentKarmaMethod)
