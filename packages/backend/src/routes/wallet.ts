import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { supabase } from '../config/database';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

// Resolve the canonical users.id for this authenticated principal and ensure a row exists.
async function ensureUserExistsInDB(user: any): Promise<string> {
  try {
    const byId = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!byId.error && byId.data) return (byId.data as any).id as string;

    const byDiscord = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', user.discordId)
      .maybeSingle();
    if (!byDiscord.error && byDiscord.data) return (byDiscord.data as any).id as string;

    const ins = await supabase
      .from('users')
      .insert({
        id: user.id,
        discord_id: user.discordId,
        username: user.username || 'unknown',
        avatar: user.avatar || null,
        email: user.email || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (ins.error) {
      // Unique discord_id conflict: fetch again by discord_id
      const again = await supabase
        .from('users')
        .select('id')
        .eq('discord_id', user.discordId)
        .maybeSingle();
      if (again.data) return (again.data as any).id as string;
      throw ins.error;
    }
    return (ins.data as any)?.id || user.id;
  } catch (e) {
    logger.warn('[Wallet] ensureUserExists threw', { error: (e as any)?.message });
    return user.id;
  }
}

const addressSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  address: z
    .string()
    .min(1, 'Address is required')
    .max(500, 'Address too long'),
  currency: z
    .string()
    .min(1, 'Currency is required')
    .max(20, 'Currency code too long'),
  network: z
    .string()
    .min(1, 'Network is required')
    .max(100, 'Network name too long'),
  tag: z.string().optional().nullable(),
});

const walletSetupSchema = z.object({
  wallet_address: z.string().min(1, 'Wallet address is required'),
  ccy: z.string().min(1, 'Currency is required'),
  chain: z.string().min(1, 'Chain is required'),
  tag: z.string().optional(),
});

router.get('/addresses', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    logger.info(`[Wallet/Addresses] Loading addresses for user: ${userId}`);

    const { data: addresses, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('[Wallet/Addresses] Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch addresses' },
      });
    }

    const transformedAddresses = (addresses ?? []).map(addr => ({
      id: addr.id,
      name: `${addr.ccy || 'Unknown'} Wallet`,
      address: addr.wallet_address,
      currency: addr.ccy,
      network: addr.chain,
      tag: addr.tag,
      isDefault: !!addr.is_default,
      createdAt: addr.created_at,
      updatedAt: addr.updated_at,
    }));

    res.json({
      success: true,
      data: { addresses: transformedAddresses },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Addresses] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

router.post('/addresses', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    // Ensure user row exists to satisfy FK (resolved above)

    const validation = addressSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid address data',
          details: validation.error.errors,
        },
      });
    }

    const addressData = validation.data;
    logger.info(
      `[Wallet/Addresses] Creating address for user ${userId}:`,
      addressData
    );

    const { data: existingAddress, error: lookupError } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .eq('wallet_address', addressData.address)
      .eq('ccy', addressData.currency)
      .eq('chain', addressData.network)
      .maybeSingle();

    if (lookupError) {
      logger.error('[Wallet/Addresses] Supabase lookup error:', lookupError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to verify address' },
      });
    }

    if (existingAddress) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ADDRESS',
          message: 'Address already exists for this currency and network',
        },
      });
    }

    // Create a Tatum Virtual Account for this address (best-effort)
    let tatum_va_id: string | null = null;
    try {
      const { tatumService } = require('../services/tatumService');
      const shortId = String(userId).replace(/-/g, '').slice(0, 8);
      const label = `u_${shortId}_${addressData.currency}_${Date.now().toString(36)}`;
      const va = await tatumService.createVirtualAccount(addressData.currency, label, userId);
      tatum_va_id = va.id;
    } catch (e) {
      logger.warn('[Wallet/Addresses] VA creation failed, continuing', { error: (e as any)?.message });
    }

    // If this is the first address for this (user, ccy, chain), mark it as default
    let makeDefault = false;
    try {
      const { data: existingDefault, error: defErr } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('ccy', addressData.currency)
        .eq('chain', addressData.network)
        .eq('is_default', true)
        .maybeSingle();
      if (defErr) { /* ignore, fallback */ }
      makeDefault = !existingDefault;
    } catch {}

    const { data: newAddress, error } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        wallet_address: addressData.address,
        ccy: addressData.currency,
        chain: addressData.network,
        tag: addressData.tag ?? null,
        tatum_va_id,
        is_default: makeDefault,
      })
      .select()
      .single();

    if (error) {
      logger.error('[Wallet/Addresses] Supabase insert error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to save address' },
      });
    }

    logger.info(
      `[Wallet/Addresses] Successfully created address ${newAddress.id} for user ${userId}`
    );

    const transformedAddress = {
      id: newAddress.id,
      name: `${newAddress.ccy} Wallet`,
      address: newAddress.wallet_address,
      currency: newAddress.ccy,
      network: newAddress.chain,
      tag: newAddress.tag,
      isDefault: !!newAddress.is_default,
      createdAt: newAddress.created_at,
      tatum_va_id: newAddress.tatum_va_id || tatum_va_id,
      updatedAt: newAddress.updated_at,
    };

    res.status(201).json({
      success: true,
      data: { address: transformedAddress },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Addresses] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

router.put('/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    const addressId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    const validation = addressSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid address data',
          details: validation.error.errors,
        },
      });
    }

    const updateData = validation.data;
    logger.info(
      `[Wallet/Addresses] Updating address ${addressId} for user ${userId}:`,
      updateData
    );

    const { data: existingAddress, error: lookupError } = await supabase
      .from('wallets')
      .select('id, ccy, chain, is_default, created_at')
      .eq('id', addressId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupError) {
      logger.error('[Wallet/Addresses] Supabase lookup error:', lookupError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to load address' },
      });
    }

    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Address not found' },
      });
    }

    const { data: updatedAddress, error } = await supabase
      .from('wallets')
      .update({
        wallet_address: updateData.address,
        ccy: updateData.currency,
        chain: updateData.network,
        tag: updateData.tag ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', addressId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error('[Wallet/Addresses] Supabase update error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update address' },
      });
    }

    logger.info(
      `[Wallet/Addresses] Successfully updated address ${addressId} for user ${userId}`
    );

    const transformedAddress = {
      id: updatedAddress.id,
      name: `${updatedAddress.ccy} Wallet`,
      address: updatedAddress.wallet_address,
      currency: updatedAddress.ccy,
      network: updatedAddress.chain,
      tag: updatedAddress.tag,
      createdAt: updatedAddress.created_at,
      updatedAt: updatedAddress.updated_at,
    };

    res.json({
      success: true,
      data: { address: transformedAddress },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Addresses] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

// Set a wallet address as default for its currency/network (clears others)
router.put('/addresses/:id/default', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    const addressId = req.params.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }

    // Load the address to get ccy/chain
    const { data: addr, error: getErr } = await supabase
      .from('wallets')
      .select('id, ccy, chain, user_id')
      .eq('id', addressId)
      .eq('user_id', userId)
      .single();
    if (getErr || !addr) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Address not found' } });
    }

    // Clear existing default for this (user, ccy, chain)
    const { error: clearErr } = await supabase
      .from('wallets')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('ccy', (addr as any).ccy)
      .eq('chain', (addr as any).chain)
      .eq('is_default', true);
    if (clearErr) {
      // Not fatal; proceed to set
    }

    // Set selected as default
    const { data: updated, error: setErr } = await supabase
      .from('wallets')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', addressId)
      .eq('user_id', userId)
      .select()
      .single();
    if (setErr) {
      return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to set default' } });
    }

    return res.json({ success: true, data: { id: updated.id, isDefault: true }, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('[Wallet/Addresses] Set default error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

router.delete('/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    const addressId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    logger.info(
      `[Wallet/Addresses] Deleting address ${addressId} for user ${userId}`
    );

    const { data: existingAddress, error: lookupError } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', addressId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupError) {
      logger.error('[Wallet/Addresses] Supabase lookup error:', lookupError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to load address' },
      });
    }

    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Address not found' },
      });
    }

    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', addressId)
      .eq('user_id', userId);

    if (error) {
      logger.error('[Wallet/Addresses] Supabase delete error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to delete address' },
      });
    }

    // If the deleted address was the default for its (ccy, chain), promote the next oldest as default
    try {
      const wasDefault = !!(existingAddress as any).is_default;
      if (wasDefault) {
        const ccy = (existingAddress as any).ccy;
        const chain = (existingAddress as any).chain;
        const { data: nextAddr, error: nextErr } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', userId)
          .eq('ccy', ccy)
          .eq('chain', chain)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!nextErr && nextAddr) {
          await supabase
            .from('wallets')
            .update({ is_default: true, updated_at: new Date().toISOString() })
            .eq('id', (nextAddr as any).id)
            .eq('user_id', userId);
          logger.info('[Wallet/Addresses] Promoted next address as default after delete', { nextId: (nextAddr as any).id, userId, ccy, chain });
        }
      }
    } catch (promoteErr) {
      logger.warn('[Wallet/Addresses] Failed promoting next default after delete', { error: (promoteErr as any)?.message });
    }

    logger.info(
      `[Wallet/Addresses] Successfully deleted address ${addressId} for user ${userId}`
    );

    res.json({
      success: true,
      data: { message: 'Address deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Addresses] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

router.post('/setup', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    // Ensure user row exists to satisfy FK
    await ensureUserExistsInDB(req.user);

    const validation = walletSetupSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid wallet setup data',
          details: validation.error.errors,
        },
      });
    }

    const { wallet_address, ccy, chain, tag } = validation.data;
    logger.info(
      `[Wallet/Setup] Setting up wallet for user ${userId}: ${ccy} on ${chain}`
    );

    const normalizedTag =
      typeof tag === 'string' && tag.trim().length > 0 ? tag.trim() : null;
    const basePayload = {
      wallet_address,
      ccy,
      chain,
      tag: normalizedTag,
    };

    // Prevent duplicates for same address+currency+network
    const { data: dup } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .eq('wallet_address', wallet_address)
      .eq('ccy', ccy)
      .eq('chain', chain)
      .maybeSingle();
    if (dup) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_ADDRESS', message: 'Address already exists for this currency and network' },
      });
    }

    // Create Tatum VA (best effort)
    let tatum_va_id: string | null = null;
    try {
      const { tatumService } = require('../services/tatumService');
      const shortId = String(userId).replace(/-/g, '').slice(0, 8);
      const label = `u_${shortId}_${ccy}_${Date.now().toString(36)}`;
      const va = await tatumService.createVirtualAccount(ccy, label, userId);
      tatum_va_id = va.id;
    } catch (e) {
      logger.warn('[Wallet/Setup] VA creation failed, continuing', { error: (e as any)?.message });
    }

    // If this is the first address for this (user, ccy, chain), mark it as default
    let makeDefault = false;
    try {
      const { data: existingDefault, error: defErr } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('ccy', ccy)
        .eq('chain', chain)
        .eq('is_default', true)
        .maybeSingle();
      if (defErr) { /* ignore */ }
      makeDefault = !existingDefault;
    } catch {}

    const { data: walletRecord, error: insertErr } = await supabase
      .from('wallets')
      .insert({ user_id: userId, wallet_address, ccy, chain, tag: normalizedTag, tatum_va_id, is_default: makeDefault })
      .select()
      .single();
    if (insertErr) {
      logger.error('[Wallet/Setup] Failed to create wallet record:', insertErr);
      return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create wallet configuration' } });
    }

    // Persist wallet mode preference: clicking Set Withdrawal Address implies Non-Custody
    try {
      const desiredMode = (req.body && typeof req.body.mode === 'string') ? String(req.body.mode) : 'non_custody';
      const { data: current, error: prefErr } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .maybeSingle();
      if (!prefErr) {
        const prefs = (current as any)?.preferences && typeof (current as any).preferences === 'object'
          ? { ...(current as any).preferences }
          : {};
        if (prefs.walletMode !== desiredMode) {
          prefs.walletMode = desiredMode;
          await supabase
            .from('users')
            .update({ preferences: prefs, updated_at: new Date().toISOString() })
            .eq('id', userId);
          logger.info('[Wallet/Setup] Updated user walletMode preference', { userId, walletMode: desiredMode });
        }
      }
    } catch (e) {
      logger.warn('[Wallet/Setup] Failed to update walletMode preference (non-critical)', { error: (e as any)?.message });
    }

    logger.info(`[Wallet/Setup] Wallet added for user ${userId}`);

    res.json({
      success: true,
      data: {
        message: 'Wallet added successfully',
        wallet_address: walletRecord.wallet_address,
        currency: walletRecord.ccy,
        chain: walletRecord.chain,
        tag: walletRecord.tag,
        tatum_va_id: walletRecord.tatum_va_id || tatum_va_id,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Setup] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    logger.info(`[Wallet/Balance] Getting balance for user ${userId}`);

    const { data: user, error } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('[Wallet/Balance] Failed to get user balance:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to get balance' },
      });
    }

    res.json({
      success: true,
      data: {
        balance: user?.balance ?? 0,
        currency: 'USD',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Balance] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    logger.info(
      `[Wallet/Transactions] Getting transactions for user ${userId}`
    );

    res.json({
      success: true,
      data: {
        transactions: [],
        total: 0,
        page: 1,
        limit: 50,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Transactions] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

// Generate HD wallet address for supported networks
const generateWalletSchema = z.object({
  currency: z.string().min(1, 'Currency is required').max(20, 'Currency code too long'),
  chain: z.string().min(1, 'Chain is required').max(100, 'Chain name too long'),
  orderId: z.string().optional(),
});

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const userId = await ensureUserExistsInDB(req.user);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    }

    const validation = generateWalletSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid wallet generation data',
          details: validation.error.errors,
        },
      });
    }

    const { currency, chain, orderId } = validation.data;
    logger.info(`[Wallet/Generate] Generating HD wallet for user ${userId}`, {
      currency,
      chain,
      orderId
    });

    // Import tatumService
    const { tatumService } = require('../services/tatumService');
    
    // Generate HD wallet address
    const result = await tatumService.generateHDWalletAddress(
      currency,
      chain,
      orderId || `gen_${Date.now()}`,
      userId
    );

    // Optionally save to wallets table
    try {
      const { data: existingWallet } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('wallet_address', result.address)
        .eq('ccy', currency)
        .eq('chain', chain)
        .maybeSingle();

      if (!existingWallet) {
        // Check if this is the first wallet for this currency/chain combination
        const { data: existingDefault } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', userId)
          .eq('ccy', currency)
          .eq('chain', chain)
          .eq('is_default', true)
          .maybeSingle();

        const isFirstWallet = !existingDefault;

        await supabase
          .from('wallets')
          .insert({
            user_id: userId,
            wallet_address: result.address,
            ccy: currency,
            chain: chain,
            tatum_va_id: result.accountId,
            is_default: isFirstWallet,
            tag: orderId ? `Generated for order ${orderId}` : 'HD Wallet Generated',
          });

        logger.info(`[Wallet/Generate] Saved generated wallet to database`, {
          userId,
          address: result.address,
          currency,
          chain,
          isDefault: isFirstWallet
        });
      }
    } catch (saveError) {
      logger.warn(`[Wallet/Generate] Failed to save wallet to database (non-critical)`, {
        error: (saveError as any)?.message
      });
    }

    res.json({
      success: true,
      data: {
        address: result.address,
        currency,
        chain,
        accountId: result.accountId,
        hasPrivateKey: !!result.privateKey,
        orderId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Wallet/Generate] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'GENERATION_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to generate wallet' 
      },
    });
  }
});

export default router;
