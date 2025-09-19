describe('Dashboard', () => {
  beforeEach(() => {
    cy.loginWithDiscord();
    
    // Mock dashboard API responses
    cy.intercept('GET', '/api/servers/test-server-1', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          server: {
            id: 'test-server-1',
            name: 'Test Server 1',
            icon: 'https://example.com/server1.png',
            botInvited: true,
            botConfig: {
              appearance: {
                name: 'TestBot',
                color: '#7289da',
                avatar: 'https://example.com/bot-avatar.png',
              },
            },
            subscription: {
              tier: 'premium',
              expiresAt: '2025-12-31',
            },
          },
        },
      },
    }).as('getServerConfig');

    cy.intercept('GET', '/api/products*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          products: [
            {
              id: 'product-1',
              name: 'Diamond Sword',
              description: 'A powerful weapon',
              price: 9.99,
              currency: 'USD',
              imageUrl: 'https://example.com/sword.png',
              category: 'Weapons',
              stock: 50,
              active: true,
            },
          ],
          pagination: {
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
          },
        },
      },
    }).as('getProducts');

    cy.intercept('GET', '/api/categories*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          categories: [
            {
              id: 'category-1',
              name: 'Weapons',
              description: 'Combat items',
              emoji: '⚔️',
              sortOrder: 1,
            },
          ],
        },
      },
    }).as('getCategories');

    cy.intercept('GET', '/api/wallet/balance', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          balance: 150.75,
          totalEarned: 500.00,
          totalWithdrawn: 349.25,
          currency: 'USD',
        },
      },
    }).as('getWalletBalance');
  });

  it('should display dashboard overview', () => {
    cy.visit('/dashboard');
    
    // Should show server selector
    cy.get('[data-testid="server-selector"]').should('be.visible');
    
    // Should show server overview
    cy.get('[data-testid="server-overview"]').should('be.visible');
    cy.contains('Test Server 1').should('be.visible');
    cy.contains('Bot Status: Connected').should('be.visible');
    
    // Should show quick actions
    cy.get('[data-testid="quick-actions"]').should('be.visible');
    cy.get('[data-testid="add-product-action"]').should('be.visible');
    cy.get('[data-testid="manage-categories-action"]').should('be.visible');
    
    // Should show recent activity
    cy.get('[data-testid="recent-activity"]').should('be.visible');
    
    // Check accessibility
    cy.checkA11y();
  });

  it('should allow server switching', () => {
    cy.visit('/dashboard');
    
    // Select different server
    cy.selectServer('test-server-2');
    
    // Should update server overview
    cy.wait('@getServerConfig');
    cy.contains('Test Server 2').should('be.visible');
  });

  it('should navigate to product management', () => {
    cy.visit('/dashboard');
    
    // Click add product action
    cy.get('[data-testid="add-product-action"]').click();
    
    // Should navigate to products page
    cy.url().should('include', '/dashboard/servers/test-server-1/products');
    
    // Should show products list
    cy.contains('Products').should('be.visible');
    cy.contains('Diamond Sword').should('be.visible');
  });

  it('should manage bot appearance settings', () => {
    cy.visit('/dashboard/servers/test-server-1/bot-config');
    
    // Should show bot appearance form
    cy.get('[data-testid="bot-appearance-settings"]').should('be.visible');
    
    // Should have current values
    cy.get('[name="name"]').should('have.value', 'TestBot');
    cy.get('[name="color"]').should('have.value', '#7289da');
    
    // Update bot name
    cy.get('[name="name"]').clear().type('UpdatedBot');
    cy.get('[name="color"]').invoke('val', '#ff0000');
    
    // Mock save response
    cy.intercept('PUT', '/api/servers/test-server-1', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          server: {
            id: 'test-server-1',
            botConfig: {
              appearance: {
                name: 'UpdatedBot',
                color: '#ff0000',
              },
            },
          },
        },
      },
    }).as('updateServerConfig');
    
    // Save changes
    cy.get('[data-testid="save-appearance-button"]').click();
    
    // Should show success message
    cy.contains('Settings saved successfully').should('be.visible');
  });

  it('should create a new product', () => {
    cy.visit('/dashboard/servers/test-server-1/products');
    
    // Click create product button
    cy.get('[data-testid="create-product-button"]').click();
    
    // Should show product form
    cy.get('[data-testid="product-form"]').should('be.visible');
    
    // Fill out form
    cy.get('[name="name"]').type('Magic Potion');
    cy.get('[name="description"]').type('Restores health');
    cy.get('[name="price"]').type('4.99');
    cy.get('[name="imageUrl"]').type('https://example.com/potion.png');
    cy.get('[name="category"]').select('Weapons');
    cy.get('[name="stock"]').type('25');
    cy.get('[name="minecraftCommands"]').type('give {player} potion 1');
    
    // Mock create response
    cy.intercept('POST', '/api/products', {
      statusCode: 201,
      body: {
        success: true,
        data: {
          product: {
            id: 'product-2',
            name: 'Magic Potion',
            description: 'Restores health',
            price: 4.99,
            currency: 'USD',
            imageUrl: 'https://example.com/potion.png',
            category: 'Weapons',
            stock: 25,
            active: true,
          },
        },
      },
    }).as('createProduct');
    
    // Submit form
    cy.get('[data-testid="save-product-button"]').click();
    
    // Should redirect to products list
    cy.url().should('include', '/dashboard/servers/test-server-1/products');
    
    // Should show new product
    cy.contains('Magic Potion').should('be.visible');
    cy.contains('Product created successfully').should('be.visible');
  });

  it('should manage wallet', () => {
    cy.visit('/dashboard/wallet');
    
    // Should show wallet balance
    cy.get('[data-testid="wallet-balance"]').should('be.visible');
    cy.contains('$150.75').should('be.visible');
    cy.contains('Total Earned: $500.00').should('be.visible');
    
    // Should show transaction history
    cy.get('[data-testid="transaction-history"]').should('be.visible');
    
    // Test withdrawal
    cy.get('[data-testid="withdraw-button"]').click();
    
    // Should show withdrawal form
    cy.get('[data-testid="withdrawal-form"]').should('be.visible');
    
    // Fill withdrawal form
    cy.get('[name="amount"]').type('50.00');
    cy.get('[name="address"]').type('test-wallet-address');
    
    // Mock withdrawal response
    cy.intercept('POST', '/api/wallet/withdraw', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          transaction: {
            id: 'withdrawal-1',
            type: 'withdrawal',
            amount: 50.00,
            status: 'pending',
          },
        },
      },
    }).as('processWithdrawal');
    
    // Submit withdrawal
    cy.get('[data-testid="submit-withdrawal-button"]').click();
    
    // Should show success message
    cy.contains('Withdrawal request submitted').should('be.visible');
  });

  it('should handle subscription management', () => {
    cy.visit('/dashboard/subscription');
    
    // Mock subscription data
    cy.intercept('GET', '/api/subscriptions/current*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          subscription: {
            id: 'sub-1',
            plan: 'premium',
            status: 'active',
            currentPeriodEnd: '2025-12-31',
            features: ['advanced_analytics', 'custom_branding'],
          },
        },
      },
    }).as('getCurrentSubscription');
    
    cy.intercept('GET', '/api/subscriptions/plans', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          plans: [
            {
              id: 'free',
              name: 'Free',
              price: 0,
              features: ['basic_features'],
            },
            {
              id: 'premium',
              name: 'Premium',
              price: 9.99,
              features: ['advanced_analytics', 'custom_branding'],
            },
          ],
        },
      },
    }).as('getSubscriptionPlans');
    
    // Should show current subscription
    cy.contains('Premium Plan').should('be.visible');
    cy.contains('Active until December 31, 2025').should('be.visible');
    
    // Should show available plans
    cy.get('[data-testid="subscription-plans"]').should('be.visible');
    
    // Test plan upgrade/downgrade
    cy.get('[data-testid="change-plan-button"]').click();
    cy.get('[data-testid="plan-free"]').click();
    
    // Should show confirmation dialog
    cy.get('[data-testid="confirm-plan-change"]').should('be.visible');
    cy.contains('downgrade to Free').should('be.visible');
  });

  it('should be responsive on mobile', () => {
    cy.viewport('iphone-x');
    cy.visit('/dashboard');
    
    // Should show mobile-friendly layout
    cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
    
    // Should be able to navigate
    cy.get('[data-testid="mobile-menu-button"]').click();
    cy.get('[data-testid="mobile-nav"]').should('be.visible');
    
    // Check accessibility on mobile
    cy.checkA11y();
  });

  it('should handle loading states', () => {
    // Mock slow API response
    cy.intercept('GET', '/api/servers/test-server-1', {
      statusCode: 200,
      body: {
        success: true,
        data: { server: { id: 'test-server-1', name: 'Test Server 1' } },
      },
      delay: 2000,
    }).as('getServerConfigSlow');
    
    cy.visit('/dashboard');
    
    // Should show loading state
    cy.get('[data-testid="loading"]').should('be.visible');
    
    // Should hide loading when data loads
    cy.wait('@getServerConfigSlow');
    cy.get('[data-testid="loading"]').should('not.exist');
  });

  it('should handle errors gracefully', () => {
    // Mock API error
    cy.intercept('GET', '/api/servers/test-server-1', {
      statusCode: 500,
      body: {
        success: false,
        error: { message: 'Server error' },
      },
    }).as('getServerConfigError');
    
    cy.visit('/dashboard');
    
    // Should show error message
    cy.contains('Failed to load server data').should('be.visible');
    
    // Should provide retry option
    cy.get('[data-testid="retry-button"]').should('be.visible');
    cy.get('[data-testid="retry-button"]').click();
    
    // Should retry the request
    cy.wait('@getServerConfigError');
  });

  it('should check accessibility across all dashboard pages', () => {
    const pages = [
      '/dashboard',
      '/dashboard/servers/test-server-1/products',
      '/dashboard/servers/test-server-1/bot-config',
      '/dashboard/wallet',
      '/dashboard/subscription',
    ];

    pages.forEach((page) => {
      cy.visit(page);
      cy.waitForLoading();
      cy.checkA11y();
    });
  });
});