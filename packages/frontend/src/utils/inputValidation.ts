import DOMPurify from 'isomorphic-dompurify';

// Frontend validation schemas and utilities
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: any;
}

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  type?: 'string' | 'number' | 'email' | 'url' | 'uuid' | 'discordId';
  custom?: (value: any) => string | null;
}

export class FrontendValidator {
  // Core validation methods
  static validateString(value: string, rules: ValidationRule = {}): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = this.sanitizeString(value);

    // Required check
    if (rules.required && (!sanitizedValue || sanitizedValue.trim().length === 0)) {
      errors.push('This field is required');
      return { isValid: false, errors };
    }

    // Skip other validations if empty and not required
    if (!sanitizedValue && !rules.required) {
      return { isValid: true, errors: [], sanitizedValue };
    }

    // Length validations
    if (rules.minLength && sanitizedValue.length < rules.minLength) {
      errors.push(`Must be at least ${rules.minLength} characters long`);
    }

    if (rules.maxLength && sanitizedValue.length > rules.maxLength) {
      errors.push(`Cannot exceed ${rules.maxLength} characters`);
      sanitizedValue = sanitizedValue.substring(0, rules.maxLength);
    }

    // Pattern validation
    if (rules.pattern && !rules.pattern.test(sanitizedValue)) {
      errors.push('Invalid format');
    }

    // Type-specific validations
    if (rules.type) {
      const typeError = this.validateType(sanitizedValue, rules.type);
      if (typeError) {
        errors.push(typeError);
      }
    }

    // Custom validation
    if (rules.custom) {
      const customError = rules.custom(sanitizedValue);
      if (customError) {
        errors.push(customError);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue
    };
  }

  static validateNumber(value: string | number, rules: ValidationRule = {}): ValidationResult {
    const errors: string[] = [];
    let numValue: number;

    // Convert to number
    if (typeof value === 'string') {
      numValue = parseFloat(value);
    } else {
      numValue = value;
    }

    // Required check
    if (rules.required && (isNaN(numValue) || value === '')) {
      errors.push('This field is required');
      return { isValid: false, errors };
    }

    // Skip other validations if empty and not required
    if (isNaN(numValue) && !rules.required) {
      return { isValid: true, errors: [], sanitizedValue: undefined };
    }

    // NaN check
    if (isNaN(numValue)) {
      errors.push('Must be a valid number');
      return { isValid: false, errors };
    }

    // Range validations
    if (rules.min !== undefined && numValue < rules.min) {
      errors.push(`Must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && numValue > rules.max) {
      errors.push(`Cannot exceed ${rules.max}`);
    }

    // Custom validation
    if (rules.custom) {
      const customError = rules.custom(numValue);
      if (customError) {
        errors.push(customError);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: numValue
    };
  }

  // Type-specific validations
  private static validateType(value: string, type: string): string | null {
    switch (type) {
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value) ? null : 'Invalid email format';

      case 'url':
        try {
          const url = new URL(value);
          if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
            return 'URL must use HTTPS';
          }
          return null;
        } catch {
          return 'Invalid URL format';
        }

      case 'uuid':
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(value) ? null : 'Invalid UUID format';

      case 'discordId':
        const discordIdRegex = /^\d{17,19}$/;
        return discordIdRegex.test(value) ? null : 'Invalid Discord ID format';

      default:
        return null;
    }
  }

  // Input sanitization
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';

    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Sanitize HTML content
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  static sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }
}

// Predefined validation rules for common use cases
export const ValidationRules = {
  productName: {
    required: true,
    minLength: 1,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\s\-_.,!?()]+$/,
    custom: (value: string) => {
      if (value.trim().length === 0) return 'Product name cannot be empty';
      return null;
    }
  },

  productDescription: {
    maxLength: 2000,
    custom: (value: string) => {
      // Check for excessive special characters
      const specialCharCount = (value.match(/[^a-zA-Z0-9\s]/g) || []).length;
      if (specialCharCount > value.length * 0.3) {
        return 'Description contains too many special characters';
      }
      return null;
    }
  },

  productPrice: {
    required: true,
    min: 0.01,
    max: 999999.99,
    custom: (value: number) => {
      // Check decimal places
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        return 'Price can have at most 2 decimal places';
      }
      return null;
    }
  },

  imageUrl: {
    type: 'url' as const,
    maxLength: 500,
    custom: (value: string) => {
      if (!value) return null;
      
      // Check for image file extensions or trusted hosts
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const trustedHosts = ['imgur.com', 'discord.com', 'discordapp.com', 'cdn.discordapp.com'];
      
      const hasImageExtension = imageExtensions.some(ext => 
        value.toLowerCase().includes(ext)
      );
      
      try {
        const url = new URL(value);
        const isTrustedHost = trustedHosts.some(host => 
          url.hostname.includes(host)
        );
        
        if (!hasImageExtension && !isTrustedHost) {
          return 'URL should point to an image file or be from a trusted image host';
        }
      } catch {
        return 'Invalid URL format';
      }
      
      return null;
    }
  },

  categoryName: {
    required: true,
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9\s\-_.,!?()]+$/
  },

  minecraftCommand: {
    required: true,
    minLength: 2,
    maxLength: 500,
    pattern: /^\/[a-zA-Z0-9\s\-_.,!?(){}[\]]+$/,
    custom: (value: string) => {
      if (!value.startsWith('/')) {
        return 'Minecraft commands must start with /';
      }
      return null;
    }
  },

  discordChannelId: {
    type: 'discordId' as const,
    required: true
  },

  walletAddress: {
    required: true,
    minLength: 10,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9]+$/,
    custom: (value: string) => {
      // Basic cryptocurrency address validation
      if (value.length < 26 || value.length > 62) {
        return 'Invalid wallet address length';
      }
      return null;
    }
  },

  cryptoAmount: {
    required: true,
    pattern: /^\d+(\.\d{1,8})?$/,
    custom: (value: string) => {
      const num = parseFloat(value);
      if (num <= 0) {
        return 'Amount must be greater than 0';
      }
      if (num > 1000000) {
        return 'Amount is too large';
      }
      return null;
    }
  }
};

// Form validation helper
export class FormValidator {
  private fields: Map<string, ValidationRule> = new Map();
  private values: Map<string, any> = new Map();
  private errors: Map<string, string[]> = new Map();

  addField(name: string, rules: ValidationRule) {
    this.fields.set(name, rules);
    return this;
  }

  setValue(name: string, value: any) {
    this.values.set(name, value);
    this.validateField(name);
    return this;
  }

  validateField(name: string): boolean {
    const rules = this.fields.get(name);
    const value = this.values.get(name);

    if (!rules) return true;

    let result: ValidationResult;

    if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))) {
      result = FrontendValidator.validateNumber(value, rules);
    } else {
      result = FrontendValidator.validateString(value || '', rules);
    }

    if (result.isValid) {
      this.errors.delete(name);
      if (result.sanitizedValue !== undefined) {
        this.values.set(name, result.sanitizedValue);
      }
    } else {
      this.errors.set(name, result.errors);
    }

    return result.isValid;
  }

  validateAll(): boolean {
    let isValid = true;

    for (const fieldName of this.fields.keys()) {
      if (!this.validateField(fieldName)) {
        isValid = false;
      }
    }

    return isValid;
  }

  getErrors(fieldName?: string): string[] | Map<string, string[]> {
    if (fieldName) {
      return this.errors.get(fieldName) || [];
    }
    return this.errors;
  }

  getValues(): Map<string, any> {
    return this.values;
  }

  getSanitizedValues(): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of this.values.entries()) {
      sanitized[key] = value;
    }
    return sanitized;
  }

  reset() {
    this.values.clear();
    this.errors.clear();
    return this;
  }

  hasErrors(): boolean {
    return this.errors.size > 0;
  }

  getFieldError(fieldName: string): string | null {
    const errors = this.errors.get(fieldName);
    return errors && errors.length > 0 ? errors[0] : null;
  }
}

// React hook for form validation
export function useFormValidation(initialRules: Record<string, ValidationRule> = {}) {
  const validator = new FormValidator();
  
  // Initialize with rules
  Object.entries(initialRules).forEach(([field, rules]) => {
    validator.addField(field, rules);
  });

  const validateField = (name: string, value: any) => {
    return validator.setValue(name, value).validateField(name);
  };

  const validateAll = () => {
    return validator.validateAll();
  };

  const getFieldError = (fieldName: string) => {
    return validator.getFieldError(fieldName);
  };

  const hasErrors = () => {
    return validator.hasErrors();
  };

  const getSanitizedValues = () => {
    return validator.getSanitizedValues();
  };

  const reset = () => {
    validator.reset();
  };

  return {
    validateField,
    validateAll,
    getFieldError,
    hasErrors,
    getSanitizedValues,
    reset,
    addField: (name: string, rules: ValidationRule) => validator.addField(name, rules)
  };
}

// Utility functions for common validations
export const ValidationUtils = {
  // Real-time validation for input fields
  createInputValidator: (rules: ValidationRule) => {
    return (value: string) => {
      const result = FrontendValidator.validateString(value, rules);
      return {
        isValid: result.isValid,
        error: result.errors[0] || null,
        sanitizedValue: result.sanitizedValue
      };
    };
  },

  // Debounced validation for performance
  createDebouncedValidator: (rules: ValidationRule, delay: number = 300) => {
    let timeoutId: NodeJS.Timeout;
    
    return (value: string, callback: (result: ValidationResult) => void) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const result = FrontendValidator.validateString(value, rules);
        callback(result);
      }, delay);
    };
  },

  // Batch validation for multiple fields
  validateBatch: (fields: Record<string, { value: any; rules: ValidationRule }>) => {
    const results: Record<string, ValidationResult> = {};
    let allValid = true;

    Object.entries(fields).forEach(([fieldName, { value, rules }]) => {
      const result = typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))
        ? FrontendValidator.validateNumber(value, rules)
        : FrontendValidator.validateString(value || '', rules);
      
      results[fieldName] = result;
      if (!result.isValid) {
        allValid = false;
      }
    });

    return { results, allValid };
  },

  // Password strength validation
  validatePasswordStrength: (password: string): ValidationResult => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: password
    };
  },

  // File validation
  validateFile: (file: File, options: {
    maxSize?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
  } = {}): ValidationResult => {
    const errors: string[] = [];
    const { maxSize = 5 * 1024 * 1024, allowedTypes = [], allowedExtensions = [] } = options;

    // Size validation
    if (file.size > maxSize) {
      errors.push(`File size cannot exceed ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Type validation
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed`);
    }

    // Extension validation
    if (allowedExtensions.length > 0) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) {
        errors.push(`File extension .${extension} is not allowed`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: file
    };
  }
};

// Export everything
export default {
  FrontendValidator,
  ValidationRules,
  FormValidator,
  useFormValidation,
  ValidationUtils
};