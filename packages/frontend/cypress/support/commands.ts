/// <reference types="cypress" />

// Custom commands for EcBot testing

/**
 * Login with Discord OAuth (mocked for testing)
 */
Cypress.Commands.add('loginWithDiscord', () => {
  // Mock the Discord OAuth flow
  cy.window().then((win) => {
    // Mock session data
    const mockSession = {
      user: {
        id: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
        image: 'https://example.com/avatar.png',
        discordId: 'test-discord-id',
      },
      expires: '2025-12-31',
      accessToken: 'mock-access-token',
    };

    // Set session in localStorage for NextAuth
    win.localStorage.setItem('nextauth.session-token', JSON.stringify(mockSession));
    
    // Mock the session provider
    (win as any).__NEXT_DATA__ = {
      props: {
        pageProps: {
          session: mockSession,
        },
      },
    };
  });

  // Intercept API calls
  cy.intercept('GET', '/api/auth/session', {
    statusCode: 200,
    body: {
      user: {
        id: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
        image: 'https://example.com/avatar.png',
        discordId: 'test-discord-id',
      },
      expires: '2025-12-31',
    },
  }).as('getSession');

  cy.intercept('GET', '/api/users/profile', {
    statusCode: 200,
    body: {
      success: true,
      data: {
        user: {
          id: 'test-user-id',
          discordId: 'test-discord-id',
          username: 'TestUser',
          email: 'test@example.com',
          avatar: 'https://example.com/avatar.png',
        },
      },
    },
  }).as('getUserProfile');

  cy.intercept('GET', '/api/users/servers', {
    statusCode: 200,
    body: {
      success: true,
      data: {
        servers: [
          {
            id: 'test-server-1',
            name: 'Test Server 1',
            icon: 'https://example.com/server1.png',
            owner: true,
            permissions: ['ADMINISTRATOR'],
            botInvited: true,
          },
          {
            id: 'test-server-2',
            name: 'Test Server 2',
            icon: 'https://example.com/server2.png',
            owner: false,
            permissions: ['MANAGE_MESSAGES'],
            botInvited: false,
          },
        ],
      },
    },
  }).as('getUserServers');
});

/**
 * Select a server from the server selector
 */
Cypress.Commands.add('selectServer', (serverId: string) => {
  cy.get('[data-testid="server-selector"]').should('be.visible');
  cy.get('[data-testid="server-selector"] select').select(serverId);
  cy.get('[data-testid="server-selector"] select').should('have.value', serverId);
});

/**
 * Check accessibility using axe-core
 */
Cypress.Commands.add('checkA11y', () => {
  cy.injectAxe();
  cy.checkA11y(undefined, {
    rules: {
      // Disable color-contrast rule for now as it can be flaky
      'color-contrast': { enabled: false },
    },
  });
});

/**
 * Wait for loading indicators to disappear
 */
Cypress.Commands.add('waitForLoading', () => {
  // Wait for any loading spinners or skeletons to disappear
  cy.get('[data-testid="loading"]', { timeout: 10000 }).should('not.exist');
  cy.get('[data-testid="skeleton"]', { timeout: 10000 }).should('not.exist');
  cy.get('.animate-spin', { timeout: 10000 }).should('not.exist');
});

// Add more custom commands as needed
export {};