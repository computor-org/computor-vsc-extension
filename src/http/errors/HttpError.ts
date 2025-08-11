export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly response?: any
  ) {
    // Create a more detailed error message if response contains detail
    let enhancedMessage = message;
    if (response?.detail) {
      // If detail is a string, append it
      if (typeof response.detail === 'string') {
        enhancedMessage = `${message} - ${response.detail}`;
      } 
      // If detail is an array (validation errors), format them
      else if (Array.isArray(response.detail)) {
        const details = response.detail.map((d: any) => 
          typeof d === 'string' ? d : d.msg || JSON.stringify(d)
        ).join(', ');
        enhancedMessage = `${message} - ${details}`;
      }
      // If detail is an object, try to extract a message
      else if (typeof response.detail === 'object' && response.detail.message) {
        enhancedMessage = `${message} - ${response.detail.message}`;
      }
    }
    // Also check for 'message' field in response (some APIs use this)
    else if (response?.message && typeof response.message === 'string') {
      enhancedMessage = `${message} - ${response.message}`;
    }
    
    super(enhancedMessage);
    this.name = 'HttpError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}