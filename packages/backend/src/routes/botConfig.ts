import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import BotConfigService, { BotConfig } from '../services/botConfig';
import Joi from 'joi';

const router = Router();

// Validation schemas
const configUpdateSchema = Joi.object().unknown(true); // Allow any bot config fields
const previewSchema = Joi.object({
  changes: Joi.object().required()
});
const rollbackSchema = Joi.object({
  version: Joi.number().integer().min(1).required()
});

/**
 * GET /api/bot-config/:serverId
 * Get current bot configuration for a server
 */
router.get('/:serverId',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;

      const config = await BotConfigService.getCurrentConfig(serverId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CONFIG_NOT_FOUND',
            message: 'Bot configuration not found for this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.info('Bot configuration retrieved', { 
        serverId, 
        userId: req.user?.id 
      });

      res.json({
        success: true,
        data: {
          config
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving bot configuration:', error);
      throw new AppError('Failed to retrieve bot configuration', 500, 'CONFIG_RETRIEVAL_ERROR');
    }
  }
);

/**
 * PUT /api/bot-config/:serverId
 * Update bot configuration for a server
 */
router.put('/:serverId',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const configChanges = req.body;

      // Validate that we have some configuration data
      if (!configChanges || Object.keys(configChanges).length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_CONFIG',
            message: 'Configuration data is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const result = await BotConfigService.updateConfig(
        serverId,
        configChanges,
        req.user!.id
      );

      logger.info('Bot configuration updated', { 
        serverId, 
        userId: req.user?.id,
        version: result.version,
        changedFields: Object.keys(configChanges)
      });

      res.json({
        success: true,
        data: {
          config: result.config,
          version: result.version
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error updating bot configuration:', error);
      throw new AppError('Failed to update bot configuration', 500, 'CONFIG_UPDATE_ERROR');
    }
  }
);

/**
 * POST /api/bot-config/:serverId/preview
 * Preview configuration changes without saving
 */
router.post('/:serverId/preview',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const { changes } = req.body;

      if (!changes || Object.keys(changes).length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_CHANGES',
            message: 'Configuration changes are required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get current configuration
      const currentConfig = await BotConfigService.getCurrentConfig(serverId) || {};

      // Preview the changes
      const preview = BotConfigService.previewConfig(currentConfig, changes);

      if (!preview.isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: preview.error,
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.info('Configuration preview generated', { 
        serverId, 
        userId: req.user?.id,
        changedFields: preview.changedFields
      });

      res.json({
        success: true,
        data: {
          preview: preview.previewConfig,
          changedFields: preview.changedFields,
          isValid: preview.isValid
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error generating configuration preview:', error);
      throw new AppError('Failed to generate configuration preview', 500, 'CONFIG_PREVIEW_ERROR');
    }
  }
);

/**
 * GET /api/bot-config/:serverId/versions
 * Get configuration version history
 */
router.get('/:serverId/versions',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const versions = await BotConfigService.getConfigVersions(serverId, limit);

      logger.info('Configuration versions retrieved', { 
        serverId, 
        userId: req.user?.id,
        count: versions.length
      });

      res.json({
        success: true,
        data: {
          versions: versions.map(version => ({
            id: version.id,
            version: version.version,
            createdBy: version.createdBy,
            createdAt: version.createdAt,
            isActive: version.isActive,
            creator: version.creator,
            // Don't include full config in list view for performance
            hasConfig: !!version.config
          }))
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving configuration versions:', error);
      throw new AppError('Failed to retrieve configuration versions', 500, 'CONFIG_VERSIONS_ERROR');
    }
  }
);

/**
 * GET /api/bot-config/:serverId/versions/:version
 * Get specific configuration version
 */
router.get('/:serverId/versions/:version',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId, version } = req.params;
      const versionNumber = parseInt(version);

      if (isNaN(versionNumber)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_VERSION',
            message: 'Version must be a valid number',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const versions = await BotConfigService.getConfigVersions(serverId, 100);
      const targetVersion = versions.find(v => v.version === versionNumber);

      if (!targetVersion) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'VERSION_NOT_FOUND',
            message: 'Configuration version not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.info('Configuration version retrieved', { 
        serverId, 
        userId: req.user?.id,
        version: versionNumber
      });

      res.json({
        success: true,
        data: {
          version: {
            id: targetVersion.id,
            version: targetVersion.version,
            config: targetVersion.config,
            createdBy: targetVersion.createdBy,
            createdAt: targetVersion.createdAt,
            isActive: targetVersion.isActive,
            creator: targetVersion.creator
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving configuration version:', error);
      throw new AppError('Failed to retrieve configuration version', 500, 'CONFIG_VERSION_ERROR');
    }
  }
);

/**
 * POST /api/bot-config/:serverId/rollback
 * Rollback to a previous configuration version
 */
router.post('/:serverId/rollback',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const { version } = req.body;

      if (!version || typeof version !== 'number') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_VERSION',
            message: 'Valid version number is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const result = await BotConfigService.rollbackToVersion(
        serverId,
        version,
        req.user!.id
      );

      logger.info('Configuration rolled back', { 
        serverId, 
        userId: req.user?.id,
        targetVersion: version,
        newVersion: result.version
      });

      res.json({
        success: true,
        data: {
          config: result.config,
          version: result.version,
          rolledBackFrom: version
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error rolling back configuration:', error);
      throw new AppError('Failed to rollback configuration', 500, 'CONFIG_ROLLBACK_ERROR');
    }
  }
);

/**
 * GET /api/bot-config/defaults/:serverType
 * Get default configuration for a server type
 */
router.get('/defaults/:serverType',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverType } = req.params;

      if (!['minecraft', 'gaming', 'general'].includes(serverType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SERVER_TYPE',
            message: 'Server type must be one of: minecraft, gaming, general',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const defaultConfig = BotConfigService.getDefaultConfig(
        serverType as 'minecraft' | 'gaming' | 'general'
      );

      logger.info('Default configuration retrieved', { 
        userId: req.user?.id,
        serverType
      });

      res.json({
        success: true,
        data: {
          config: defaultConfig,
          serverType
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving default configuration:', error);
      throw new AppError('Failed to retrieve default configuration', 500, 'DEFAULT_CONFIG_ERROR');
    }
  }
);

/**
 * POST /api/bot-config/:serverId/validate
 * Validate bot configuration without saving
 */
router.post('/:serverId/validate',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const config = req.body;

      if (!config || Object.keys(config).length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_CONFIG',
            message: 'Configuration data is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const validation = BotConfigService.validateConfig(config);

      logger.info('Configuration validated', { 
        serverId, 
        userId: req.user?.id,
        isValid: validation.isValid
      });

      res.json({
        success: true,
        data: {
          isValid: validation.isValid,
          error: validation.error,
          validatedConfig: validation.validatedConfig
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error validating configuration:', error);
      throw new AppError('Failed to validate configuration', 500, 'CONFIG_VALIDATION_ERROR');
    }
  }
);

export default router;