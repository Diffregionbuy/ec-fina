describe('Onboarding Flow', () => {
  beforeEach(() => {
    cy.loginWithDiscord();
    
    // Mock onboarding API responses
    cy.intercept('GET', '/api/onboarding/status*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          progress: {
            currentStep: 'welcome',
            completedSteps: [],
            isCompleted: false,
          },
        },
      },
    }).as('getOnboardingStatus');

    cy.intercept('GET', '/api/onboarding/templates*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          templates: [
            {
              id: 'gaming',
              name: 'Gaming Server',
              category: 'gaming',
              description: 'Perfect for gaming communities',
              previewImage: 'https://example.com/gaming.jpg',
            },
            {
              id: 'general',
              name: 'General Community',
              category: 'general',
              description: 'Great for general purpose servers',
              previewImage: 'https://example.com/general.jpg',
            },
          ],
        },
      },
    }).as('getTemplates');

    cy.intercept('POST', '/api/onboarding/progress', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          progress: {
            currentStep: 'template',
            completedSteps: ['welcome', 'invite'],
            isCompleted: false,
          },
        },
      },
    }).as('saveProgress');
  });

  it('should complete the full onboarding flow', () => {
    cy.visit('/onboarding/welcome');
    
    // Welcome step
    cy.contains('Welcome to EcBot Setup!').should('be.visible');
    cy.get('[data-testid="progress-indicator"]').should('contain', 'Step 1 of 4');
    cy.checkA11y();
    
    cy.get('[data-testid="next-button"]').click();
    
    // Bot invite step
    cy.url().should('include', '/onboarding/invite-bot');
    cy.contains('Invite Bot to Your Server').should('be.visible');
    cy.get('[data-testid="progress-indicator"]').should('contain', 'Step 2 of 4');
    
    // Mock bot invite
    cy.intercept('GET', 'https://discord.com/api/oauth2/authorize*', {
      statusCode: 200,
    }).as('discordBotInvite');
    
    cy.get('[data-testid="bot-invite-button"]').click();
    
    // Should show success message
    cy.contains('Bot successfully invited!').should('be.visible');
    
    // Continue to template selection
    cy.get('[data-testid="continue-button"]').click();
    
    // Template selection step
    cy.url().should('include', '/onboarding/templates');
    cy.contains('Choose a Template').should('be.visible');
    cy.get('[data-testid="progress-indicator"]').should('contain', 'Step 3 of 4');
    
    // Should show template options
    cy.get('[data-testid="template-card-gaming"]').should('be.visible');
    cy.get('[data-testid="template-card-general"]').should('be.visible');
    
    // Select gaming template
    cy.get('[data-testid="template-card-gaming"]').click();
    cy.get('[data-testid="template-card-gaming"]').should('have.class', 'border-blue-500');
    
    // Continue button should be enabled
    cy.get('[data-testid="next-button"]').should('not.be.disabled');
    cy.get('[data-testid="next-button"]').click();
    
    // Setup wizard step
    cy.url().should('include', '/onboarding/setup-wizard');
    cy.contains('Configure Your Bot').should('be.visible');
    cy.get('[data-testid="progress-indicator"]').should('contain', 'Step 4 of 4');
    
    // Fill out bot configuration
    cy.get('[name="botName"]').type('MyGameBot');
    cy.get('[name="botColor"]').invoke('val', '#ff6b6b');
    
    // Mock configuration save
    cy.intercept('POST', '/api/servers/*/setup-template', {
      statusCode: 200,
      body: {
        success: true,
        data: { server: { id: 'test-server-1' } },
      },
    }).as('applyTemplate');
    
    cy.get('[data-testid="finish-setup-button"]').click();
    
    // Should complete onboarding
    cy.url().should('include', '/onboarding/complete');
    cy.contains('Setup Complete!').should('be.visible');
    
    // Should have option to go to dashboard
    cy.get('[data-testid="go-to-dashboard-button"]').click();
    cy.url().should('include', '/dashboard');
  });

  it('should allow navigation between steps', () => {
    cy.visit('/onboarding/templates');
    
    // Should be able to go back
    cy.get('[data-testid="previous-button"]').click();
    cy.url().should('include', '/onboarding/invite-bot');
    
    // Should be able to go forward again
    cy.get('[data-testid="bot-invite-button"]').click();
    cy.get('[data-testid="continue-button"]').click();
    cy.url().should('include', '/onboarding/templates');
  });

  it('should save progress and allow resuming', () => {
    // Start onboarding
    cy.visit('/onboarding/welcome');
    cy.get('[data-testid="next-button"]').click();
    
    // Complete bot invite
    cy.get('[data-testid="bot-invite-button"]').click();
    cy.get('[data-testid="continue-button"]').click();
    
    // Select template but don't finish
    cy.get('[data-testid="template-card-gaming"]').click();
    
    // Leave and come back
    cy.visit('/dashboard');
    cy.visit('/onboarding');
    
    // Should resume from where we left off
    cy.url().should('include', '/onboarding/templates');
    cy.get('[data-testid="template-card-gaming"]').should('have.class', 'border-blue-500');
  });

  it('should handle template preview', () => {
    cy.visit('/onboarding/templates');
    
    // Should show template previews
    cy.get('[data-testid="template-card-gaming"] img').should('be.visible');
    cy.get('[data-testid="template-card-gaming"] img').should('have.attr', 'alt', 'Gaming Server preview');
    
    // Should show template details
    cy.get('[data-testid="template-card-gaming"]').should('contain', 'Gaming Server');
    cy.get('[data-testid="template-card-gaming"]').should('contain', 'Perfect for gaming communities');
  });

  it('should be keyboard accessible', () => {
    cy.visit('/onboarding/templates');
    
    // Should be able to navigate templates with keyboard
    cy.get('[data-testid="template-card-gaming"]').focus();
    cy.focused().type('{enter}');
    
    // Should select the template
    cy.get('[data-testid="template-card-gaming"]').should('have.class', 'border-blue-500');
    
    // Should be able to navigate to next button
    cy.focused().type('{tab}');
    cy.focused().should('have.attr', 'data-testid', 'next-button');
  });

  it('should handle errors gracefully', () => {
    // Mock API error
    cy.intercept('GET', '/api/onboarding/templates*', {
      statusCode: 500,
      body: {
        success: false,
        error: { message: 'Failed to load templates' },
      },
    }).as('getTemplatesError');
    
    cy.visit('/onboarding/templates');
    
    // Should show error message
    cy.contains('Failed to load templates').should('be.visible');
    
    // Should provide retry option
    cy.get('[data-testid="retry-button"]').should('be.visible');
  });

  it('should validate required fields', () => {
    cy.visit('/onboarding/setup-wizard');
    
    // Try to continue without filling required fields
    cy.get('[data-testid="finish-setup-button"]').click();
    
    // Should show validation errors
    cy.contains('Bot name is required').should('be.visible');
    
    // Fill required field
    cy.get('[name="botName"]').type('TestBot');
    
    // Error should disappear
    cy.contains('Bot name is required').should('not.exist');
  });

  it('should check accessibility throughout the flow', () => {
    const steps = [
      '/onboarding/welcome',
      '/onboarding/invite-bot',
      '/onboarding/templates',
      '/onboarding/setup-wizard',
    ];

    steps.forEach((step) => {
      cy.visit(step);
      cy.checkA11y();
    });
  });
});