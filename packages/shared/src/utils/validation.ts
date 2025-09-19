import { z } from 'zod';

export const validateDiscordId = (id: string): boolean => {
  return /^\d{17,19}$/.test(id);
};

export const validateMinecraftUsername = (username: string): boolean => {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
};

export const validateServerAddress = (address: string): boolean => {
  // Basic validation for IP or domain
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
  
  return ipRegex.test(address) || domainRegex.test(address);
};

export const createValidationError = (field: string, message: string) => {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: [field],
      message,
    },
  ]);
};