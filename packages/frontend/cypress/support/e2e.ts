// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';
import 'cypress-axe';

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Add custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to login with Discord OAuth
       * @example cy.loginWithDiscord()
       */
      loginWithDiscord(): Chainable<void>;
      
      /**
       * Custom command to select a server
       * @example cy.selectServer('server-id')
       */
      selectServer(serverId: string): Chainable<void>;
      

      
      /**
       * Custom command to wait for loading to finish
       * @example cy.waitForLoading()
       */
      waitForLoading(): Chainable<void>;
    }
  }
}

// Configure Cypress
Cypress.on('uncaught:exception', (err, runnable) => {
  // Returning false here prevents Cypress from failing the test
  // on uncaught exceptions that might be expected in some scenarios
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  if (err.message.includes('Non-Error promise rejection captured')) {
    return false;
  }
  return true;
});

// Set up viewport
beforeEach(() => {
  cy.viewport(1280, 720);
});