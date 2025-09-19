import { render, screen } from '@testing-library/react';
import { DiscordApiLoader } from '../DiscordApiLoader';
import { DiscordApiLoadingState } from '@/types/dashboard';

describe('DiscordApiLoader', () => {
  it('should not render when not loading and not retrying', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: null,
      isStale: false,
    };

    const { container } = render(
      <DiscordApiLoader loadingState={loadingState} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render loading state with default message', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: true,
      isRetrying: false,
      retryCount: 0,
      error: null,
      isStale: false,
    };

    render(<DiscordApiLoader loadingState={loadingState} />);

    expect(screen.getByText('Loading Discord data...')).toBeInTheDocument();
  });

  it('should render loading state with custom message', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: true,
      isRetrying: false,
      retryCount: 0,
      error: null,
      isStale: false,
    };

    render(
      <DiscordApiLoader 
        loadingState={loadingState} 
        message="Loading your servers..."
      />
    );

    expect(screen.getByText('Loading your servers...')).toBeInTheDocument();
  });

  it('should render retrying state with retry count', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: true,
      retryCount: 2,
      error: null,
      isStale: false,
    };

    render(<DiscordApiLoader loadingState={loadingState} />);

    expect(screen.getByText('Reconnecting to Discord... (2/3)')).toBeInTheDocument();
    expect(screen.getByText('Discord services may be temporarily unavailable')).toBeInTheDocument();
  });

  it('should show spinning icon for loading state', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: true,
      isRetrying: false,
      retryCount: 0,
      error: null,
      isStale: false,
    };

    const { container } = render(<DiscordApiLoader loadingState={loadingState} />);

    // Check for spinning animation class
    const spinningIcon = container.querySelector('.animate-spin');
    expect(spinningIcon).toBeInTheDocument();
  });

  it('should show refresh icon for retrying state', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: true,
      retryCount: 1,
      error: null,
      isStale: false,
    };

    const { container } = render(<DiscordApiLoader loadingState={loadingState} />);

    // Check for spinning refresh icon
    const refreshIcon = container.querySelector('.animate-spin');
    expect(refreshIcon).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: true,
      isRetrying: false,
      retryCount: 0,
      error: null,
      isStale: false,
    };

    const { container } = render(
      <DiscordApiLoader 
        loadingState={loadingState} 
        className="custom-loader-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-loader-class');
  });

  it('should render when both loading and retrying are true', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: true,
      isRetrying: true,
      retryCount: 1,
      error: null,
      isStale: false,
    };

    render(<DiscordApiLoader loadingState={loadingState} />);

    // Should show retrying message when both are true
    expect(screen.getByText('Reconnecting to Discord... (1/3)')).toBeInTheDocument();
  });
});