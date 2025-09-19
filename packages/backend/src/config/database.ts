import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration. Please check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client with service role key for backend operations
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

// Database connection utilities
export class DatabaseService {
  private static instance: DatabaseService;
  private client: SupabaseClient;

  private constructor() {
    this.client = supabase;
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public getClient(): SupabaseClient {
    return this.client;
  }

  // Test database connection
  public async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('count')
        .limit(1);
      
      if (error) {
        logger.error('Database connection test failed:', error);
        return false;
      }
      
      logger.info('Database connection test successful');
      return true;
    } catch (error) {
      logger.error('Database connection test error:', error);
      return false;
    }
  }

  // Execute a query with error handling
  public async executeQuery<T>(
    tableName: string,
    operation: (table: any) => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> {
    try {
      const table = this.client.from(tableName);
      const result = await operation(table);
      
      if (result.error) {
        logger.error(`Database query error on table ${tableName}:`, result.error);
      }
      
      return result;
    } catch (error) {
      logger.error(`Database operation failed on table ${tableName}:`, error);
      return { data: null, error };
    }
  }

  // Get database statistics
  public async getStats(): Promise<{
    connected: boolean;
    tables: string[];
    timestamp: string;
  }> {
    try {
      const connected = await this.testConnection();
      
      // Get table names from information_schema
      const { data: tables } = await this.client
        .rpc('get_table_names')
        .select('*');
      
      return {
        connected,
        tables: tables || [],
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      return {
        connected: false,
        tables: [],
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance();