import { render, screen, fireEvent } from '@testing-library/react';
import { DiscordApiError } from '../DiscordApiError';
import { DiscordApiLoadingState } from '@/types/dashboard';

describe('DiscordApiError', () => {
  const mockOnRetry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when no error and not stale', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: null,
      isStale: false,
    };

    const { container } = render(
      <DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render error message with retry button', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 2,
      error: 'Failed to connect to Discord API',
      isStale: false,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    expect(screen.getByText('Discord API Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to connect to Discord API')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('should call onRetry when retry button is clicked', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 1,
      error: 'Network error',
      isStale: false,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    fireEvent.click(screen.getByText('Try Again'));
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('should show retrying state without retry button', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: true,
      retryCount: 2,
      error: 'Connection failed',
      isStale: false,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    expect(screen.getByText('Retrying...')).toBeInTheDocument();
    expect(screen.getByText('Attempting to reconnect... (2/3)')).toBeInTheDocument();
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
  });

  it('should show stale data indicator', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: null,
      isStale: true,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    expect(screen.getByText('Cached Data')).toBeInTheDocument();
    expect(screen.getByText('Showing cached data while Discord services are unavailable.')).toBeInTheDocument();
  });

  it('should show appropriate error type for service unavailable', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: 'Discord services are temporarily unavailable',
      isStale: false,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    expect(screen.getByText('Service Unavailable')).toBeInTheDocument();
  });

  it('should show appropriate error type for network errors', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: 'Failed to connect to server',
      isStale: false,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    expect(screen.getByText('Connection Error')).toBeInTheDocument();
  });

  it('should show appropriate error type for timeout errors', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: 'Request timeout occurred',
      isStale: false,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    expect(screen.getByText('Request Timeout')).toBeInTheDocument();
  });

  it('should show appropriate error type for rate limit errors', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: 'Too many requests - rate limit exceeded',
      isStale: false,
    };

    render(<DiscordApiError loadingState={loadingState} onRetry={mockOnRetry} />);

    expect(screen.getByText('Rate Limited')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const loadingState: DiscordApiLoadingState = {
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
      error: 'Test error',
      isStale: false,
    };

    const { container } = render(
      <DiscordApiError 
        loadingState={loadingState} 
        onRetry={mockOnRetry} 
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should show correct background colors for different states', () => {
    const { rerender, container } = render(
      <DiscordApiError 
        loadingState={{
          isLoading: false,
          isRetrying: true,
          retryCount: 1,
          error: 'Retrying...',
          isStale: false,
        }} 
        onRetry={mockOnRetry} 
      />
    );

    // Retrying state should have blue background
    expect(container.firstChild).toHaveClass('bg-blue-50', 'border-blue-200');

    rerender(
      <DiscordApiError 
        loadingState={{
          isLoading: false,
          isRetrying: false,
          retryCount: 0,
          error: null,
          isStale: true,
        }} 
        onRetry={mockOnRetry} 
      />
    );

    // Stale state should have yellow background
    expect(container.firstChild).toHaveClass('bg-yellow-50', 'border-yellow-200');

    rerender(
      <DiscordApiError 
        loadingState={{
          isLoading: false,
          isRetrying: false,
          retryCount: 0,
          error: 'Error message',
          isStale: false,
        }} 
        onRetry={mockOnRetry} 
      />
    );

    // Error state should have red background
    expect(container.firstChild).toHaveClass('bg-red-50', 'border-red-200');
  });
});