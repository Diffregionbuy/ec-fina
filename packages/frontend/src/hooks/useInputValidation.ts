import { useState, useCallback, useEffect } from 'react';
import { FrontendValidator, ValidationRule, ValidationResult } from '../utils/inputValidation';

export interface UseInputValidationOptions {
  rules: ValidationRule;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
}

export function useInputValidation(options: UseInputValidationOptions) {
  const { rules, validateOnChange = true, validateOnBlur = true, debounceMs = 300 } = options;
  
  const [value, setValue] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState<boolean>(true);
  const [isTouched, setIsTouched] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Debounced validation
  const validateValue = useCallback((inputValue: string) => {
    setIsValidating(true);
    
    const timeoutId = setTimeout(() => {
      const result = FrontendValidator.validateString(inputValue, rules);
      setErrors(result.errors);
      setIsValid(result.isValid);
      setIsValidating(false);
      
      // Update value with sanitized version if different
      if (result.sanitizedValue !== inputValue) {
        setValue(result.sanitizedValue || '');
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [rules, debounceMs]);

  // Immediate validation (for blur events)
  const validateImmediate = useCallback((inputValue: string) => {
    const result = FrontendValidator.validateString(inputValue, rules);
    setErrors(result.errors);
    setIsValid(result.isValid);
    
    if (result.sanitizedValue !== inputValue) {
      setValue(result.sanitizedValue || '');
    }
    
    return result;
  }, [rules]);

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
    setIsTouched(true);
    
    if (validateOnChange) {
      validateValue(newValue);
    }
  }, [validateOnChange, validateValue]);

  const handleBlur = useCallback(() => {
    setIsTouched(true);
    
    if (validateOnBlur) {
      validateImmediate(value);
    }
  }, [validateOnBlur, validateImmediate, value]);

  const reset = useCallback(() => {
    setValue('');
    setErrors([]);
    setIsValid(true);
    setIsTouched(false);
    setIsValidating(false);
  }, []);

  const validate = useCallback(() => {
    return validateImmediate(value);
  }, [validateImmediate, value]);

  return {
    value,
    errors,
    isValid,
    isTouched,
    isValidating,
    handleChange,
    handleBlur,
    reset,
    validate,
    // Helper properties
    hasErrors: errors.length > 0,
    firstError: errors[0] || null,
    showErrors: isTouched && errors.length > 0
  };
}

// Hook for number inputs
export function useNumberValidation(options: UseInputValidationOptions) {
  const { rules, validateOnChange = true, validateOnBlur = true, debounceMs = 300 } = options;
  
  const [value, setValue] = useState<string>('');
  const [numericValue, setNumericValue] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState<boolean>(true);
  const [isTouched, setIsTouched] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  const validateValue = useCallback((inputValue: string) => {
    setIsValidating(true);
    
    const timeoutId = setTimeout(() => {
      const result = FrontendValidator.validateNumber(inputValue, rules);
      setErrors(result.errors);
      setIsValid(result.isValid);
      setNumericValue(result.sanitizedValue || null);
      setIsValidating(false);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [rules, debounceMs]);

  const validateImmediate = useCallback((inputValue: string) => {
    const result = FrontendValidator.validateNumber(inputValue, rules);
    setErrors(result.errors);
    setIsValid(result.isValid);
    setNumericValue(result.sanitizedValue || null);
    return result;
  }, [rules]);

  const handleChange = useCallback((newValue: string) => {
    // Allow only numeric input with decimal point
    const numericRegex = /^-?\d*\.?\d*$/;
    if (numericRegex.test(newValue) || newValue === '') {
      setValue(newValue);
      setIsTouched(true);
      
      if (validateOnChange) {
        validateValue(newValue);
      }
    }
  }, [validateOnChange, validateValue]);

  const handleBlur = useCallback(() => {
    setIsTouched(true);
    
    if (validateOnBlur) {
      validateImmediate(value);
    }
  }, [validateOnBlur, validateImmediate, value]);

  const reset = useCallback(() => {
    setValue('');
    setNumericValue(null);
    setErrors([]);
    setIsValid(true);
    setIsTouched(false);
    setIsValidating(false);
  }, []);

  const validate = useCallback(() => {
    return validateImmediate(value);
  }, [validateImmediate, value]);

  return {
    value,
    numericValue,
    errors,
    isValid,
    isTouched,
    isValidating,
    handleChange,
    handleBlur,
    reset,
    validate,
    hasErrors: errors.length > 0,
    firstError: errors[0] || null,
    showErrors: isTouched && errors.length > 0
  };
}

// Hook for form-level validation
export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  validationRules: Record<keyof T, ValidationRule>
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<keyof T, string[]>>({} as Record<keyof T, string[]>);
  const [touched, setTouched] = useState<Record<keyof T, boolean>>({} as Record<keyof T, boolean>);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const validateField = useCallback((fieldName: keyof T, value: any) => {
    const rules = validationRules[fieldName];
    if (!rules) return { isValid: true, errors: [] };

    const result = typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))
      ? FrontendValidator.validateNumber(value, rules)
      : FrontendValidator.validateString(value || '', rules);

    setErrors(prev => ({
      ...prev,
      [fieldName]: result.errors
    }));

    return result;
  }, [validationRules]);

  const validateAll = useCallback(() => {
    const newErrors: Record<keyof T, string[]> = {} as Record<keyof T, string[]>;
    let isFormValid = true;

    Object.keys(validationRules).forEach(fieldName => {
      const key = fieldName as keyof T;
      const result = validateField(key, values[key]);
      newErrors[key] = result.errors;
      
      if (!result.isValid) {
        isFormValid = false;
      }
    });

    setErrors(newErrors);
    return isFormValid;
  }, [values, validationRules, validateField]);

  const handleFieldChange = useCallback((fieldName: keyof T, value: any) => {
    setValues(prev => ({
      ...prev,
      [fieldName]: value
    }));

    setTouched(prev => ({
      ...prev,
      [fieldName]: true
    }));

    // Validate field if it's been touched
    if (touched[fieldName]) {
      validateField(fieldName, value);
    }
  }, [touched, validateField]);

  const handleFieldBlur = useCallback((fieldName: keyof T) => {
    setTouched(prev => ({
      ...prev,
      [fieldName]: true
    }));

    validateField(fieldName, values[fieldName]);
  }, [values, validateField]);

  const handleSubmit = useCallback(async (onSubmit: (values: T) => Promise<void> | void) => {
    setIsSubmitting(true);
    
    // Mark all fields as touched
    const allTouched = Object.keys(validationRules).reduce((acc, key) => {
      acc[key as keyof T] = true;
      return acc;
    }, {} as Record<keyof T, boolean>);
    setTouched(allTouched);

    // Validate all fields
    const isValid = validateAll();
    
    if (isValid) {
      try {
        await onSubmit(values);
      } catch (error) {
        console.error('Form submission error:', error);
      }
    }
    
    setIsSubmitting(false);
  }, [values, validationRules, validateAll]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({} as Record<keyof T, string[]>);
    setTouched({} as Record<keyof T, boolean>);
    setIsSubmitting(false);
  }, [initialValues]);

  const getFieldError = useCallback((fieldName: keyof T) => {
    const fieldErrors = errors[fieldName];
    return fieldErrors && fieldErrors.length > 0 ? fieldErrors[0] : null;
  }, [errors]);

  const hasFieldError = useCallback((fieldName: keyof T) => {
    return touched[fieldName] && errors[fieldName] && errors[fieldName].length > 0;
  }, [touched, errors]);

  const isFormValid = useCallback(() => {
    return Object.values(errors).every(fieldErrors => fieldErrors.length === 0);
  }, [errors]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleFieldChange,
    handleFieldBlur,
    handleSubmit,
    validateField,
    validateAll,
    reset,
    getFieldError,
    hasFieldError,
    isFormValid
  };
}

// Hook for real-time validation with debouncing
export function useRealtimeValidation(
  initialValue: string = '',
  rules: ValidationRule,
  debounceMs: number = 300
) {
  const [value, setValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: []
  });

  // Debounce the value
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [value, debounceMs]);

  // Validate when debounced value changes
  useEffect(() => {
    if (debouncedValue !== initialValue || debouncedValue !== '') {
      const result = FrontendValidator.validateString(debouncedValue, rules);
      setValidationResult(result);
      
      // Update value with sanitized version if different
      if (result.sanitizedValue && result.sanitizedValue !== debouncedValue) {
        setValue(result.sanitizedValue);
      }
    }
  }, [debouncedValue, rules, initialValue]);

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  const reset = useCallback(() => {
    setValue(initialValue);
    setDebouncedValue(initialValue);
    setValidationResult({ isValid: true, errors: [] });
  }, [initialValue]);

  return {
    value,
    handleChange,
    reset,
    isValid: validationResult.isValid,
    errors: validationResult.errors,
    firstError: validationResult.errors[0] || null,
    isValidating: value !== debouncedValue
  };
}