import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface Migration {
  id: string;
  filename: string;
  sql: string;
}

export class DatabaseMigrator {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = join(__dirname, 'migrations');
  }

  /**
   * Get all migration files sorted by filename
   */
  getMigrationFiles(): Migration[] {
    const files = readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const sql = readFileSync(join(this.migrationsPath, filename), 'utf-8');
      const id = filename.replace('.sql', '');
      return { id, filename, sql };
    });
  }

  /**
   * Get combined SQL for all migrations
   */
  getCombinedMigrationSQL(): string {
    const migrations = this.getMigrationFiles();
    
    let combinedSQL = '-- EcBot SaaS Platform - Combined Database Migration\n';
    combinedSQL += '-- Generated automatically from migration files\n\n';

    migrations.forEach(migration => {
      combinedSQL += `-- Migration: ${migration.filename}\n`;
      combinedSQL += migration.sql;
      combinedSQL += '\n\n';
    });

    return combinedSQL;
  }

  /**
   * Write combined migration to a single file for manual execution
   */
  writeCombinedMigration(outputPath?: string): string {
    const outputFile = outputPath || join(__dirname, 'combined_migration.sql');
    const combinedSQL = this.getCombinedMigrationSQL();
    
    require('fs').writeFileSync(outputFile, combinedSQL);
    console.log(`✓ Combined migration written to: ${outputFile}`);
    
    return outputFile;
  }

  /**
   * Display migration instructions
   */
  displayInstructions(): void {
    console.log('\n=== Database Migration Instructions ===\n');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to the SQL Editor');
    console.log('3. Copy and paste the migration SQL from the generated file');
    console.log('4. Execute the SQL to create all tables, policies, and indexes\n');
    
    const migrations = this.getMigrationFiles();
    console.log('Migration files to execute in order:');
    migrations.forEach((migration, index) => {
      console.log(`  ${index + 1}. ${migration.filename}`);
    });
    console.log('\nOr use the combined migration file for one-time execution.\n');
  }
}

// CLI interface
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  const command = process.argv[2];

  switch (command) {
    case 'generate':
      migrator.writeCombinedMigration();
      migrator.displayInstructions();
      break;
    case 'instructions':
      migrator.displayInstructions();
      break;
    default:
      console.log('Usage: ts-node migrator.ts [generate|instructions]');
      console.log('  generate     - Create combined migration file');
      console.log('  instructions - Display setup instructions');
      break;
  }
}