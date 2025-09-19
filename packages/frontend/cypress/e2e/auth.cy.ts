describe('Authentication Flow', () => {
  beforeEach(() => {
    // Mock API responses
    cy.intercept('GET', '/api/auth/session', { statusCode: 401 }).as('getSessionUnauthenticated');
  });

  it('should display sign in page for unauthenticated users', () => {
    cy.visit('/');
    
    // Should redirect to sign in or show sign in button
    cy.contains('Sign in with Discord').should('be.visible');
    
    // Check accessibility
    cy.checkA11y();
  });

  it('should handle Discord OAuth sign in', () => {
    cy.visit('/auth/signin');
    
    // Mock successful OAuth response
    cy.intercept('POST', '/api/auth/signin/discord', {
      statusCode: 200,
      body: { url: '/dashboard' },
    }).as('discordSignIn');
    
    // Click sign in button
    cy.contains('Sign in with Discord').click();
    
    // Should redirect to Discord OAuth (in real app)
    // For testing, we'll mock the successful return
    cy.loginWithDiscord();
    
    // Should redirect to dashboard after successful login
    cy.url().should('include', '/dashboard');
  });

  it('should handle authentication errors', () => {
    cy.visit('/auth/error?error=OAuthAccountNotLinked');
    
    // Should display error message
    cy.contains('Authentication Error').should('be.visible');
    cy.contains('Account not linked').should('be.visible');
    
    // Should provide way to try again
    cy.contains('Try Again').should('be.visible');
    
    // Check accessibility
    cy.checkA11y();
  });

  it('should handle sign out', () => {
    // Start with authenticated user
    cy.loginWithDiscord();
    cy.visit('/dashboard');
    
    // Mock sign out
    cy.intercept('POST', '/api/auth/signout', {
      statusCode: 200,
      body: { url: '/' },
    }).as('signOut');
    
    // Find and click sign out button (usually in user menu)
    cy.get('[data-testid="user-menu"]').click();
    cy.contains('Sign Out').click();
    
    // Should redirect to home page
    cy.url().should('eq', Cypress.config().baseUrl + '/');
    
    // Should show sign in option again
    cy.contains('Sign in with Discord').should('be.visible');
  });

  it('should persist authentication across page reloads', () => {
    cy.loginWithDiscord();
    cy.visit('/dashboard');
    
    // Verify we're on dashboard
    cy.contains('Dashboard').should('be.visible');
    
    // Reload page
    cy.reload();
    
    // Should still be authenticated and on dashboard
    cy.contains('Dashboard').should('be.visible');
    cy.url().should('include', '/dashboard');
  });

  it('should handle session expiration', () => {
    cy.loginWithDiscord();
    cy.visit('/dashboard');
    
    // Mock expired session
    cy.intercept('GET', '/api/auth/session', {
      statusCode: 401,
      body: { error: 'Session expired' },
    }).as('expiredSession');
    
    // Trigger a request that would check session
    cy.get('[data-testid="user-profile"]').should('be.visible');
    
    // Make a request that would fail due to expired session
    cy.intercept('GET', '/api/users/profile', {
      statusCode: 401,
      body: { error: 'Unauthorized' },
    }).as('unauthorizedRequest');
    
    // Reload to trigger session check
    cy.reload();
    
    // Should redirect to sign in
    cy.url().should('include', '/auth/signin');
  });
});