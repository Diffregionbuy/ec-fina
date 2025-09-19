import { 
    Interaction, 
    ChatInputCommandInteraction, 
    ButtonInteraction, 
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    AutocompleteInteraction,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { getBrowseSession, setBrowseSession, updateBrowseSession } from '../utils/browseSessionStore';
import { CommandHandler } from './commandHandler';
import { eventLogger, logEvent } from '../utils/logger';

// Default hardcoded lists (fallback)
const DEFAULT_COIN_TICKERS = ['ETH','BTC','USDT','USDC','MATIC','BNB','SOL','ADA','XRP','DOGE','LTC','TRX','AVAX','ALGO','FTM'];

const DEFAULT_NETS: Record<string, { id: string; label: string }[]> = {
  // Native Blockchain Coins
  ETH: [
    { id: 'ethereum-mainnet', label: 'Ethereum Mainnet (Native)' }
  ],
  BTC: [
    { id: 'bitcoin-mainnet', label: 'Bitcoin Mainnet (Native)' }
  ],
  MATIC: [
    { id: 'polygon-mainnet', label: 'Polygon PoS (Native)' }
  ],
  BNB: [
    { id: 'bsc-mainnet', label: 'BNB Smart Chain (Native)' }
  ],
  SOL: [
    { id: 'solana-mainnet', label: 'Solana Mainnet (Native)' }
  ],
  ADA: [
    { id: 'cardano-mainnet', label: 'Cardano Mainnet (Native)' }
  ],
  XRP: [
    { id: 'xrp-mainnet', label: 'XRP Ledger (Native)' }
  ],
  DOGE: [
    { id: 'dogecoin-mainnet', label: 'Dogecoin Mainnet (Native)' }
  ],
  LTC: [
    { id: 'litecoin-mainnet', label: 'Litecoin Mainnet (Native)' }
  ],
  TRX: [
    { id: 'tron-mainnet', label: 'TRON Mainnet (Native)' }
  ],
  AVAX: [
    { id: 'avalanche-c-chain', label: 'Avalanche C-Chain (Native)' }
  ],
  ALGO: [
    { id: 'algorand-mainnet', label: 'Algorand Mainnet (Native)' }
  ],
  FTM: [
    { id: 'fantom-mainnet', label: 'Fantom Opera (Native)' }
  ],

  // Multi-Chain Tokens (Stablecoins)
  USDT: [
    { id: 'ethereum-erc20', label: 'Ethereum (ERC20)' },
    { id: 'bsc-bep20', label: 'BNB Smart Chain (BEP20)' },
    { id: 'polygon-erc20', label: 'Polygon (ERC20)' },
    { id: 'tron-trc20', label: 'TRON (TRC20)' },
    { id: 'solana-spl', label: 'Solana (SPL)' },
    { id: 'avalanche-erc20', label: 'Avalanche C-Chain (ERC20)' },
    { id: 'arbitrum-erc20', label: 'Arbitrum One (ERC20)' },
    { id: 'optimism-erc20', label: 'Optimism (ERC20)' }
  ],
  USDC: [
    { id: 'ethereum-erc20', label: 'Ethereum (ERC20)' },
    { id: 'bsc-bep20', label: 'BNB Smart Chain (BEP20)' },
    { id: 'polygon-erc20', label: 'Polygon (ERC20)' },
    { id: 'solana-spl', label: 'Solana (SPL)' },
    { id: 'avalanche-erc20', label: 'Avalanche C-Chain (ERC20)' },
    { id: 'arbitrum-erc20', label: 'Arbitrum One (ERC20)' },
    { id: 'optimism-erc20', label: 'Optimism (ERC20)' }
  ],
};

// Dynamic loader for Tatum-supported coins/networks
type TatumNetwork = { id: string; name: string; chain: string; symbol: string };
type TatumCoin = { symbol: string; name: string; networks: TatumNetwork[] };

let DYNAMIC_COIN_TICKERS: string[] | null = null;
let DYNAMIC_NETS: Record<string, { id: string; label: string }[]> | null = null;
let lastLoadedAt = 0;
const TTL_MS = 30 * 60 * 1000;

async function loadTatumSupported(): Promise<void> {
  const now = Date.now();
  if (DYNAMIC_COIN_TICKERS && now - lastLoadedAt < TTL_MS) return;
  try {
    const backend = process.env.BACKEND_URL || 'http://localhost:3001';
    const token =
      process.env.DISCORD_BOT_SERVICE_TOKEN ||
      process.env.BACKEND_BOT_TOKEN ||
      process.env.BACKEND_TOKEN;
    const resp = await fetch(`${backend}/api/tatum/supported`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-BOT-TOKEN': token } : {}),
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json();
    const coins: TatumCoin[] = Array.isArray(body?.data) ? body.data : [];
    const coinSymbols = coins.map((c) => c.symbol.toUpperCase());
    const netsMap: Record<string, { id: string; label: string }[]> = {};
    coins.forEach((c) => {
      netsMap[c.symbol.toUpperCase()] = c.networks
        .filter((n) => n && n.chain)
        .map((n) => ({ id: n.chain, label: `${n.name}` }));
    });
    if (coinSymbols.length) {
      DYNAMIC_COIN_TICKERS = coinSymbols;
      DYNAMIC_NETS = netsMap;
      lastLoadedAt = now;
    }
  } catch (e) {
    // Keep defaults on failure
  }
}

// Kick off background load (non-blocking)
void loadTatumSupported();

// Proxies to provide dynamic data seamlessly, with default fallback
const COIN_TICKERS: any = new Proxy(DEFAULT_COIN_TICKERS as any, {
  get(_t, prop: any) {
    const src: any = (DYNAMIC_COIN_TICKERS as any) || (DEFAULT_COIN_TICKERS as any);
    // Trigger background refresh opportunistically
    void loadTatumSupported();
    return src[prop];
  },
  ownKeys() { void loadTatumSupported(); return Object.keys((DYNAMIC_COIN_TICKERS as any) || DEFAULT_COIN_TICKERS); },
  getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; },
});

const NETS: any = new Proxy(DEFAULT_NETS as any, {
  get(_t, prop: any) {
    const src: any = (DYNAMIC_NETS as any) || (DEFAULT_NETS as any);
    // Trigger background refresh opportunistically
    void loadTatumSupported();
    return src[prop];
  },
});

export class InteractionHandler {
    private bot: any; // ECBot instance
    private commandHandler: CommandHandler;

    constructor(bot: any) {
        this.bot = bot;
        this.commandHandler = new CommandHandler(bot);
    }

    /**
     * Handle all Discord interactions
     */
    public async handleInteraction(interaction: Interaction): Promise<void> {
        try {
            // Early debug log for all interactions
            eventLogger.info('Incoming interaction', {
                type: interaction.type,
                isChatInput: interaction.isChatInputCommand?.() ?? false,
                userId: (interaction as any).user?.id,
                guildId: (interaction as any).guildId
            });

            if (interaction.isChatInputCommand()) {
                await this.handleSlashCommand(interaction);
            } else if (interaction.isButton()) {
                await this.handleButton(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await this.handleSelectMenu(interaction);
            } else if (interaction.isModalSubmit()) {
                await this.handleModal(interaction);
            } else if (interaction.isAutocomplete()) {
                await this.handleAutocomplete(interaction);
            } else {
                eventLogger.warn(`Unhandled interaction type: ${interaction.type}`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
            }
        } catch (error: any) {
            eventLogger.error('Error handling interaction:', {
                error: error.message,
                stack: error.stack,
                interactionType: interaction.type,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            // Try to respond with error message if possible
            try {
                const errorMessage = '❌ An error occurred while processing your request. Please try again later.';
                
                if (interaction.isRepliable()) {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({
                            content: errorMessage,
                            flags: 64
                        });
                    } else {
                        await interaction.reply({
                            content: errorMessage,
                            flags: 64
                        });
                    }
                }
            } catch (responseError) {
                eventLogger.error('Failed to send error response:', responseError);
            }
        }
    }

    /**
     * Handle slash commands
     */
    private async handleSlashCommand(interaction: Interaction): Promise<void> {
        if (!interaction.isChatInputCommand()) return;

        // Do not defer here; commands manage their own reply/defer to avoid double-ack
        logEvent('slash_command', {
            command: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId
        });

        await this.commandHandler.handleCommand(interaction);
    }

    /**
     * Handle button interactions
     */
    private async handleButton(interaction: ButtonInteraction): Promise<void> {
        const customId = interaction.customId;
        
        logEvent('button_click', {
            customId,
            userId: interaction.user.id,
            guildId: interaction.guildId
        });

        // Direct match for home buttons first
        if (customId === 'home_start') {
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
            } catch (e) {
                eventLogger.warn('Failed to deferUpdate for home_start', { error: (e as any)?.message });
            }
            await this.renderShopBrowseFromHome(interaction);
            return;
        } else if (customId === 'home_link_mc') {
            await interaction.reply({ content: '⛏️ Use /link minecraft to get your 6-digit linking code.', flags: 64 });
            return;
        } else if (customId === 'home_reviews') {
            await interaction.reply({ content: '⭐ Reviews page coming soon.', flags: 64 });
            return;
        }

        // Parse custom ID to determine action
        const [action, ...params] = customId.split('_');

        switch (action) {
            case 'shop':
                await this.handleShopButton(interaction, params);
                break;
            case 'payment':
                await this.handlePaymentButton(interaction, params);
                break;
            case 'category':
                await this.handleCategoryButton(interaction, params);
                break;
            case 'product':
                await this.handleProductButton(interaction, params);
                break;
            case 'cart':
                await this.handleCartButton(interaction, params);
                break;
            case 'admin':
                await this.handleAdminButton(interaction, params);
                break;
            case 'minecraft':
                await this.handleMinecraftButton(interaction, params);
                break;
            case 'confirm':
                await this.handleConfirmButton(interaction, params);
                break;
            case 'invoice':
                await this.handleInvoiceButton(interaction, params);
                break;
            case 'link':
                await interaction.reply({ content: '⛏️ Use /link minecraft to link your account.', flags: 64 });
                break;
            default:
                eventLogger.warn(`Unknown button action: ${action}`, {
                    customId,
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                
                await interaction.followUp({
                    content: '❌ Unknown button action.',
                    flags: 64
                });
        }
    }

    /**
     * Handle select menu interactions
     */
    private async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        // Universal quick-ack to avoid 10062/InteractionNotReplied on slow paths
        if (!interaction.deferred && !interaction.replied) {
            try { await interaction.deferUpdate(); } catch {}
        }
        const customId = interaction.customId;
        const selectedValues = interaction.values;

        logEvent('select_menu', {
            customId,
            selectedValues,
            userId: interaction.user.id,
            guildId: interaction.guildId
        });

        // Parse custom ID to determine action
        const [action, ...params] = customId.split('_');

        switch (action) {
            case 'category':
                await this.handleCategorySelect(interaction, params, selectedValues);
                break;
            case 'product':
                await this.handleProductSelect(interaction, params, selectedValues);
                break;
            case 'quantity':
                await this.handleQuantitySelect(interaction, params, selectedValues);
                break;
            case 'coin':
                await this.handleCoinSelect(interaction, params, selectedValues);
                break;
            case 'network':
                await this.handleNetworkSelect(interaction, params, selectedValues);
                break;
            case 'qty':
                await this.handleQtySelect(interaction, params, selectedValues);
                break;
            case 'payment':
                await this.handlePaymentSelect(interaction, params, selectedValues);
                break;
            default:
                eventLogger.warn(`Unknown select menu action: ${action}`, {
                    customId,
                    selectedValues,
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                
                await interaction.reply({
                    content: '❌ Unknown selection.',
                    flags: 64
                });
        }
    }

    /**
     * Handle modal submissions
     */
    private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
        const customId = interaction.customId;

        logEvent('modal_submit', {
            customId,
            userId: interaction.user.id,
            guildId: interaction.guildId
        });

        // Parse custom ID to determine action
        const [action, ...params] = customId.split('_');

        switch (action) {
            case 'minecraft':
                await this.handleMinecraftModal(interaction, params);
                break;
            case 'admin':
                await this.handleAdminModal(interaction, params);
                break;
            default:
                eventLogger.warn(`Unknown modal action: ${action}`, {
                    customId,
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                
                await interaction.reply({
                    content: '❌ Unknown modal submission.',
                    flags: 64
                });
        }
    }

    /**
     * Handle autocomplete interactions
     */
    private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const commandName = interaction.commandName;
        const focusedOption = interaction.options.getFocused(true);

        logEvent('autocomplete', {
            command: commandName,
            option: focusedOption.name,
            value: focusedOption.value,
            userId: interaction.user.id,
            guildId: interaction.guildId
        });

        try {
            // Handle autocomplete based on command and option
            switch (commandName) {
                case 'shop':
                    await this.handleShopAutocomplete(interaction, focusedOption);
                    break;
                case 'admin':
                    await this.handleAdminAutocomplete(interaction, focusedOption);
                    break;
                default:
                    await interaction.respond([]);
            }
        } catch (error: any) {
            eventLogger.error('Error handling autocomplete:', error);
            await interaction.respond([]);
        }
    }

    // Render browse view when invoked from home_start
    private async renderShopBrowseFromHome(interaction: ButtonInteraction): Promise<void> {
        try {
            const { BotApiService } = await import('../services/botApiService');
            const { setBrowseSession } = await import('../utils/browseSessionStore');
            const botApi = BotApiService.getInstance();
            const serverId = interaction.guildId!;

            // Fetch products, categories, templates + global settings
            const [prodRes, catRes] = await Promise.all([
                (botApi as any).getServerProducts ? (botApi as any).getServerProducts(serverId) : botApi.getProducts(serverId),
                (botApi as any).getServerCategories ? (botApi as any).getServerCategories(serverId) : botApi.getCategories(serverId)
            ]);

            let templates: any[] = [];
            let globalPds: any = null;
            try {
                const tRes = (botApi as any).getServerTemplatesWithSettings
                    ? await (botApi as any).getServerTemplatesWithSettings(serverId)
                    : { templates: await botApi.getServerTemplates(serverId), product_display_settings: null };
                templates = Array.isArray((tRes as any)?.templates)
                    ? (tRes as any).templates
                    : (Array.isArray(tRes) ? (tRes as any) : []);
                globalPds = (tRes as any)?.product_display_settings ?? null;
            } catch (e: any) {
                await interaction.followUp({ content: 'Go to http://localhost:3000/ to set the bot', flags: 64 }).catch(() => {});
                return;
            }

            // Normalize arrays
            const productsArr = Array.isArray(prodRes)
                ? prodRes
                : Array.isArray((prodRes as any)?.products) ? (prodRes as any).products
                : Array.isArray((prodRes as any)?.items) ? (prodRes as any).items
                : Array.isArray((prodRes as any)?.data) ? (prodRes as any).data
                : [];
            const categoriesArr = Array.isArray(catRes)
                ? catRes
                : Array.isArray((catRes as any)?.categories) ? (catRes as any).categories
                : Array.isArray((catRes as any)?.items) ? (catRes as any).items
                : Array.isArray((catRes as any)?.data) ? (catRes as any).data
                : [];

            // Choose menu template and resolve product display settings
            const templatesArr: any[] = Array.isArray(templates)
                ? templates
                : (templates && typeof templates === 'object' ? Object.values(templates as any) : []);
            const menuTmpl: any =
                templatesArr.find((t: any) => String(t?.id).toLowerCase() === 'private_main_menu') ??
                templatesArr.find((t: any) => String(t?.type).toLowerCase() === 'private_main_menu') ??
                templatesArr.find((t: any) => String(t?.name).toLowerCase() === 'private main menu') ??
                templatesArr.find((t: any) => (t?.product_display_settings || t?.productDisplaySettings)) ??
                templatesArr[0];

            const hex = (menuTmpl?.color as string) || '#0099FF';
            const parsedColor = parseInt(String(hex).replace('#', ''), 16);
            const color = Number.isNaN(parsedColor) ? 0x0099FF : parsedColor;

            const embeds: any[] = [];
            if (menuTmpl?.banner_url) {
                embeds.push({ color, image: { url: menuTmpl.banner_url } });
            }

            const mainBody: any = {
                title: menuTmpl?.title || 'Game Shop',
                color,
                description: menuTmpl?.description || 'Welcome to your private shopping panel!'
            };
            if (menuTmpl?.thumbnail_url) mainBody.thumbnail = { url: menuTmpl.thumbnail_url };
            if (Array.isArray(menuTmpl?.fields) && menuTmpl.fields.length > 0) {
                mainBody.fields = menuTmpl.fields.map((f: any) => ({
                    name: f?.name ?? '\u200b',
                    value: f?.value ?? '\u200b',
                    inline: !!f?.inline
                }));
            }
            embeds.push(mainBody);

            // Resolve display settings
            const getPds = (obj: any): { pds: any; rawMode: any } => {
                if (!obj || typeof obj !== 'object') return { pds: {}, rawMode: '' };
                const pdsLocal =
                    obj.product_display_settings ??
                    obj.productDisplaySettings ??
                    obj.settings?.product_display_settings ??
                    obj.settings?.productDisplaySettings ??
                    obj.content?.product_display_settings ??
                    obj.content?.productDisplaySettings ??
                    {};
                const rawModeLocal =
                    pdsLocal?.displayMode ??
                    pdsLocal?.display_mode ??
                    pdsLocal?.mode ??
                    obj.displayMode ??
                    obj.display_mode ??
                    '';
                return { pds: pdsLocal, rawMode: rawModeLocal };
            };
            const sources = [
                menuTmpl,
                ...(Array.isArray(templatesArr) ? templatesArr : []),
                ...(globalPds ? [{ product_display_settings: globalPds }] : [])
            ];
            let pds: any = {};
            let rawMode: any = '';
            for (const t of sources) {
                const { pds: cand, rawMode: candMode } = getPds(t);
                const hasAny = (typeof candMode === 'string' && candMode.trim() !== '') || cand?.showProducts !== undefined || cand?.show_products !== undefined;
                if (hasAny) { pds = cand || {}; rawMode = candMode || ''; break; }
            }
            const showProductsRaw = pds?.showProducts ?? pds?.show_products ?? menuTmpl?.showProducts ?? true;
            const showProducts = !(String(showProductsRaw).toLowerCase() === 'false' || showProductsRaw === false);
            const modeStr = typeof rawMode === 'string' ? rawMode.toLowerCase().trim() : '';
            const layout: 'vertical' | 'horizontal' = (modeStr === 'vertical' || modeStr === 'v' || modeStr === 'list') ? 'vertical' : 'horizontal';

            // Helper formatters
            const short = (s: any, max = 80) => {
                const str = typeof s === 'string' ? s : (s ? String(s) : '');
                return str.length > max ? str.slice(0, max - 1) + '…' : str;
            };
            const fmtPrice = (p: any, cur: any) => {
                const price = (typeof p === 'number' || typeof p === 'string') ? p : '';
                const c = typeof cur === 'string' ? cur : '';
                return price !== '' ? `${price}${c ? ' ' + c : ''}` : '';
            };

            // Category embeds (respect 10 embed limit)
            const remainingSlots = Math.max(0, 10 - embeds.length);
            const categorySlice = categoriesArr.slice(0, remainingSlots);
            for (const cat of categorySlice) {
                const catEmbed: any = {
                    title: cat.name || 'Category',
                    color,
                    description: cat.description || `${cat.name ? cat.name + ' ' : ''}items`,
                    fields: []
                };

                if (showProducts) {
                    const catProducts = productsArr.filter((p: any) => p?.category_id === cat.id && (p?.is_active ?? true)).slice(0, 10);
                    if (layout === 'vertical') {
                        catProducts.forEach((p: any) => {
                            const price = fmtPrice(p?.price, p?.currency);
                            const ratingLine = (typeof p?.rating_avg === 'number' && typeof p?.rating_count === 'number' && Number(p.rating_count) > 0)
                                ? `
> ${Number(p.rating_avg).toFixed(1)}/5 from ${p.rating_count} deals`
                                : ((p?.rating || p?.reviews_avg) ? `
> ${(p?.rating || p?.reviews_avg)}/5` : `
> No ratings yet`);
                            const desc = short(p?.description, 100);
                            catEmbed.fields.push({
                                name: p?.name || 'Unnamed',
                                value: `> ${desc || 'No description'}${price ? `
> ${price}` : ''}${ratingLine}`,
                                inline: false
                            });
                        });
                    } else {
                        catProducts.forEach((p: any) => {
                            const price = fmtPrice(p?.price, p?.currency);
                            const ratingLine = (typeof p?.rating_avg === 'number' && typeof p?.rating_count === 'number' && Number(p.rating_count) > 0)
                                ? `
> ${Number(p.rating_avg).toFixed(1)}/5 from ${p.rating_count} deals`
                                : ((p?.rating || p?.reviews_avg) ? `
> ${(p?.rating || p?.reviews_avg)}/5` : `
> No ratings yet`);
                            const desc = short(p?.description, 80);
                            catEmbed.fields.push({
                                name: p?.name || 'Unnamed',
                                value: `> ${desc || 'No description'}${price ? `
> ${price}` : ''}${ratingLine}`,
                                inline: true
                            });
                        });
                    }
                }

                const catImage = (cat as any)?.image_url || (cat as any)?.banner_url;
                if (catImage) {
                    catEmbed.image = { url: catImage };
                }
                embeds.push(catEmbed);
            }

            // Footer to last embed
            if (menuTmpl?.footer_text || menuTmpl?.footer_icon_url) {
                const last = embeds[embeds.length - 1];
                if (last) {
                    last.footer = { text: menuTmpl.footer_text || '', icon_url: menuTmpl.footer_icon_url || undefined };
                }
            }

            // Build progressive dropdowns
            const toShort = (s: any, max = 50) => {
                const str = typeof s === 'string' ? s : (s ? String(s) : '');
                return str.length > max ? str.slice(0, max - 1) + '…' : str;
            };
            const categoryOptions = categoriesArr.slice(0, 25).map((c: any) => ({
                label: String(c?.name ?? 'Unnamed'),
                value: String(c?.id ?? ''),
                description: (typeof c?.description === 'string' && c.description.length ? toShort(c.description, 50) : undefined)
            })).filter((o: any) => o.value && o.label);
            const productOptions = productsArr.slice(0, 25).map((p: any) => {
                const name = (typeof p?.name === 'string' && p.name.length ? p.name : 'Unnamed');
                const descRaw = typeof p?.description === 'string' ? p.description : '';
                const desc = descRaw ? toShort(descRaw, 50) : '';
                const price = fmtPrice(p?.price, p?.currency);
                const description = [desc, price].filter(Boolean).join(' • ') || undefined;
                return { label: name.length > 100 ? name.slice(0, 99) + '…' : name, value: String(p?.id ?? ''), description };
            }).filter((o: any) => o.value && o.label);

            const components = [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder().setCustomId('category_select').setPlaceholder('Select category').setMinValues(1).setMaxValues(1)
                        .addOptions(categoryOptions.length ? categoryOptions : [{ label: 'No categories', value: 'none', description: 'No categories available' }])
                ),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder().setCustomId('product_select').setPlaceholder('Select product').setMinValues(1).setMaxValues(1)
                        .setDisabled(true).addOptions({ label: 'Select a category first', value: 'placeholder', description: 'Choose a category to see products' })
                ),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder().setCustomId('payment_select').setPlaceholder('Select payment method').setMinValues(1).setMaxValues(1)
                        .setDisabled(true).addOptions(
                            { label: 'Crypto currency', value: 'crypto', description: 'Pay with crypto' },
                            { label: 'Fiat payment (coming soon)', value: 'fiat', description: 'Coming soon' }
                        )
                )
            ];

            // Send ephemeral category page; keep homepage intact
            const msg: any = await interaction.followUp({ embeds, components, flags: 64 });

            // Cache session for dropdowns
            try {
                const normalizedProducts = Array.isArray(productsArr) ? productsArr : [];
                const normalizedCategories = Array.isArray(categoriesArr) ? categoriesArr : [];
                if (msg?.id) setBrowseSession(String(msg.id), { products: normalizedProducts, categories: normalizedCategories });
            } catch {}
        } catch (e) {
            eventLogger.error('renderShopBrowseFromHome error', e as any);
            try { await interaction.followUp({ content: '❌ Failed to open categories.', flags: 64 }); } catch {}
        }
    }

    // Button handler methods
    private async handleShopButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        await interaction.reply({
            content: '🛍️ Shop functionality coming soon!',
            flags: 64
        });
    }

    private async handlePaymentButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        // Implementation will be added when payment system is integrated
        await interaction.reply({
            content: '💳 Payment functionality coming soon!',
            flags: 64
        });
    }

    private async handleCategoryButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        // Implementation will be added when category browsing is created
        await interaction.reply({
            content: '📂 Category browsing coming soon!',
            flags: 64
        });
    }

    private async handleProductButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        // Implementation will be added when product display is created
        await interaction.reply({
            content: '📦 Product details coming soon!',
            flags: 64
        });
    }

    private async handleCartButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        // Implementation will be added when shopping cart is created
        await interaction.reply({
            content: '🛒 Shopping cart coming soon!',
            flags: 64
        });
    }

    private async handleAdminButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        // Implementation will be added when admin panel is created
        await interaction.reply({
            content: '⚙️ Admin panel coming soon!',
            flags: 64
        });
    }

    private async handleMinecraftButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        // Implementation will be added when Minecraft integration is created
        await interaction.reply({
            content: '⛏️ Minecraft integration coming soon!',
            flags: 64
        });
    }

    // Select menu handler methods
    private async handleCategorySelect(interaction: StringSelectMenuInteraction, params: string[], values: string[]): Promise<void> {
        try {
            if (!interaction.deferred && !interaction.replied) {
                try { await interaction.deferUpdate(); } catch {}
            }


            const serverId = interaction.guildId!;
            const selectedCategoryId = values[0];
            try {
                const messageId = (interaction as any).message?.id as string | undefined;
                if (messageId) updateBrowseSession(messageId, { selectedCategoryId });
            } catch {}

            // Prefer cached session; fallback to API if missing
            const messageId = (interaction as any).message?.id as string | undefined;
            let session = messageId ? getBrowseSession(messageId) : null;

            let products: any[] = [];
            let categories: any[] = [];

            if (session) {
                products = Array.isArray(session.products) ? session.products : [];
                categories = Array.isArray(session.categories) ? session.categories : [];
            } else {
                const api = (await import('../services/botApiService')).BotApiService.getInstance();
                [products, categories] = await Promise.all([
                    (api as any).getServerProducts ? (api as any).getServerProducts(serverId) : api.getProducts(serverId),
                    (api as any).getServerCategories ? (api as any).getServerCategories(serverId) : api.getCategories(serverId)
                ]);
                if (messageId) {
                    setBrowseSession(messageId, { products, categories });
                }
            }

            const safeStr = (s: any) => (typeof s === 'string' ? s : s ? String(s) : '');
            const short = (s: any, max = 50) => {
                const str = safeStr(s);
                return str.length > max ? str.slice(0, max - 1) + '…' : str;
            };

            // Build category options
            const categoryOptions = (Array.isArray(categories) ? categories : [])
                .slice(0, 25)
                .map((c: any) => ({
                    label: safeStr(c?.name) || 'Unnamed',
                    value: String(c?.id ?? ''),
                    description: short(c?.description, 50) || undefined
                }))
                .filter(o => o.value && o.label);

            // Build product options filtered by selected category
            const filteredProducts = (Array.isArray(products) ? products : []).filter((p: any) => String(p?.category_id) === String(selectedCategoryId));
            const productOptions = filteredProducts
                .slice(0, 25)
                .map((p: any) => ({
                    label: (safeStr(p?.name) || 'Unnamed').slice(0, 100),
                    value: String(p?.id ?? ''),
                    description: [short(p?.description, 50), safeStr(p?.price) && safeStr(p?.currency) ? `${p.price} ${p.currency}` : ''].filter(Boolean).join(' • ') || undefined
                }))
                .filter(o => o.value && o.label);

            const categorySelect = new StringSelectMenuBuilder()
                .setCustomId('category_select')
                .setPlaceholder('Select category')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(categoryOptions.length ? categoryOptions : [{ label: 'No categories', value: 'none', description: 'No categories available' }]);

            const productSelect = new StringSelectMenuBuilder()
                .setCustomId('product_select')
                .setPlaceholder('Select product')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(productOptions.length === 0)
                .addOptions(productOptions.length ? productOptions : [{ label: 'No products in this category', value: 'none', description: 'Please choose a different category' }]);

            const paymentSelect = new StringSelectMenuBuilder()
                .setCustomId('payment_select')
                .setPlaceholder('Select payment method')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(true)
                .addOptions(
                    { label: 'Crypto currency', value: 'crypto', description: 'Pay with crypto' },
                    { label: 'Fiat payment (coming soon)', value: 'fiat', description: 'Coming soon' }
                );

            const payload = {
                components: [
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect),
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(productSelect),
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(paymentSelect)
                ]
            };
            try {
                await interaction.webhook.editMessage(String((interaction as any).message?.id), payload as any);
            } catch (_e) {
                try { await interaction.followUp({ ...payload, flags: 64 } as any); } catch {}
            }
        } catch (e) {
            try {
                await interaction.followUp({ content: '❌ Failed to load products for this category.', flags: 64 });
            } catch {}
        }
    }

    private async handleProductSelect(interaction: StringSelectMenuInteraction, params: string[], values: string[]): Promise<void> {
        try {
            if (!interaction.deferred && !interaction.replied) {
                try { await interaction.deferUpdate(); } catch {}
            }


            const serverId = interaction.guildId!;
            const selectedProductId = values[0];
            try {
                const messageId = (interaction as any).message?.id as string | undefined;
                if (messageId) updateBrowseSession(messageId, { selectedProductId });
            } catch {}

            // Prefer cached session; fallback to API if missing
            const messageId = (interaction as any).message?.id as string | undefined;
            let session = messageId ? getBrowseSession(messageId) : null;

            let products: any[] = [];
            let categories: any[] = [];

            if (session) {
                products = Array.isArray(session.products) ? session.products : [];
                categories = Array.isArray(session.categories) ? session.categories : [];
            } else {
                const api = (await import('../services/botApiService')).BotApiService.getInstance();
                [products, categories] = await Promise.all([
                    (api as any).getServerProducts ? (api as any).getServerProducts(serverId) : api.getProducts(serverId),
                    (api as any).getServerCategories ? (api as any).getServerCategories(serverId) : api.getCategories(serverId)
                ]);
                if (messageId) {
                    setBrowseSession(messageId, { products, categories });
                }
            }

            const safeStr = (s: any) => (typeof s === 'string' ? s : s ? String(s) : '');
            const short = (s: any, max = 50) => {
                const str = safeStr(s);
                return str.length > max ? str.slice(0, max - 1) + '…' : str;
            };

            const categoryOptions = (Array.isArray(categories) ? categories : [])
                .slice(0, 25)
                .map((c: any) => ({
                    label: safeStr(c?.name) || 'Unnamed',
                    value: String(c?.id ?? ''),
                    description: short(c?.description, 50) || undefined
                }))
                .filter(o => o.value && o.label);

            // Derive the product's category to keep products filtered consistently
            const selectedProduct = (Array.isArray(products) ? products : []).find((p: any) => String(p?.id) === String(selectedProductId));
            const categoryId = selectedProduct?.category_id;

            const filteredProducts = (Array.isArray(products) ? products : []).filter((p: any) => !categoryId || String(p?.category_id) === String(categoryId));
            const productOptions = filteredProducts
                .slice(0, 25)
                .map((p: any) => ({
                    label: (safeStr(p?.name) || 'Unnamed').slice(0, 100),
                    value: String(p?.id ?? ''),
                    description: [short(p?.description, 50), safeStr(p?.price) && safeStr(p?.currency) ? `${p.price} ${p.currency}` : ''].filter(Boolean).join(' • ') || undefined
                }))
                .filter(o => o.value && o.label);

            const categorySelect = new StringSelectMenuBuilder()
                .setCustomId('category_select')
                .setPlaceholder('Select category')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(categoryOptions.length ? categoryOptions : [{ label: 'No categories', value: 'none', description: 'No categories available' }]);

            const productSelect = new StringSelectMenuBuilder()
                .setCustomId('product_select')
                .setPlaceholder('Select product')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(productOptions.length === 0)
                .addOptions(productOptions.length ? productOptions : [{ label: 'No products', value: 'none', description: 'No products available' }]);

            const paymentSelect = new StringSelectMenuBuilder()
                .setCustomId('payment_select')
                .setPlaceholder('Select payment method')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(false)
                .addOptions(
                    { label: 'Crypto currency', value: 'crypto', description: 'Pay with crypto' },
                    { label: 'Fiat payment (coming soon)', value: 'fiat', description: 'Coming soon' }
                );

            const payload = {
                components: [
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect),
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(productSelect),
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(paymentSelect)
                ]
            };
            try {
                await interaction.webhook.editMessage(String((interaction as any).message?.id), payload as any);
            } catch (_e) {
                try { await interaction.followUp({ ...payload, flags: 64 } as any); } catch {}
            }
        } catch (e) {
            try {
                await interaction.followUp({ content: '❌ Failed to enable payment options.', flags: 64 });
            } catch {}
        }
    }

    private async handleQuantitySelect(interaction: StringSelectMenuInteraction, params: string[], values: string[]): Promise<void> {
        await interaction.followUp({
            content: `🔢 Selected quantity: ${values[0]}`,
            flags: 64
        });
    }

    private async handlePaymentSelect(interaction: StringSelectMenuInteraction, params: string[], values: string[]): Promise<void> {
        try {
            // Acknowledge immediately to avoid "Interaction failed"
            if (!interaction.deferred && !interaction.replied) {
                try { await interaction.deferUpdate(); } catch {}
            }
            const method = values[0];

            if (method === 'fiat') {
                // Inform user privately; do not alter the browse view
                await interaction.followUp({ content: '💳 Fiat payment is coming soon.', flags: 64 });
                return;
            }

            if (method === 'crypto') {
                const serverId = interaction.guildId!;
                const messageId = (interaction as any).message?.id as string | undefined;

                // Read selection from session
                const session = messageId ? getBrowseSession(messageId) : null;
                const products: any[] = Array.isArray(session?.products) ? session!.products : [];
                const selectedProductId = (session as any)?.selectedProductId;
                const selectedProduct = products.find((p: any) => String(p?.id) === String(selectedProductId));

                if (!selectedProduct) {
                    // Already deferred above; use followUp to avoid InteractionAlreadyReplied
                    await interaction.followUp({ content: '⚠️ Please select a product first.', flags: 64 });
                    return;
                }

                // Fetch templates to get confirmation_page
                const { BotApiService } = await import('../services/botApiService');
                const botApi = BotApiService.getInstance();
                let templates: any[] = [];
                try {
                    const tRes = (botApi as any).getServerTemplatesWithSettings
                        ? await (botApi as any).getServerTemplatesWithSettings(serverId)
                        : { templates: await botApi.getServerTemplates(serverId) };
                    templates = Array.isArray((tRes as any)?.templates)
                        ? (tRes as any).templates
                        : (Array.isArray(tRes) ? (tRes as any) : []);
                } catch {}

                const templatesArr: any[] = Array.isArray(templates) ? templates : (templates && typeof templates === 'object' ? Object.values(templates as any) : []);
                const tmpl: any =
                    templatesArr.find((t: any) => String(t?.id).toLowerCase() === 'confirmation_page') ??
                    templatesArr.find((t: any) => String(t?.type).toLowerCase() === 'confirmation_page') ??
                    templatesArr.find((t: any) => String(t?.name).toLowerCase() === 'confirmation page');

                // Compute amounts
                const priceNum = Number(selectedProduct?.price ?? 0) || 0;
                // Live network fee via backend (OKX) for initial render (ETH default network)
                let networkFeeStr = 'calculating...';
                const defaultNetId = (NETS?.ETH?.[0]?.id) || 'ethereum-erc20';
                try {
                    const est = await botApi.getFeeEstimate({ coin: 'ETH', network: defaultNetId }, 3200);
                    if (est && typeof est.feeNative === 'number' && est.feeUnit && est.feeNative > 0) {
                        networkFeeStr = `${est.feeNative} ${est.feeUnit}`;
                    }
                } catch {}

                // Placeholder values
                const vars: Record<string, string> = {
                    product_name: selectedProduct?.name ?? 'Unknown Item',
                    product_description: selectedProduct?.description ?? 'No description',
                    item_price: priceNum.toFixed(2),
                    network_fee: networkFeeStr,
                    total_price: priceNum.toFixed(2),
                    minecraft_username: 'Link via /link minecraft',
                    crypto_currency: 'Crypto'
                };
                const fill = (s?: any) => {
                    const str = typeof s === 'string' ? s : '';
                    return str.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] ?? _m));
                };

                const colorHex = (tmpl?.color as string) || '#3B82F6';
                const parsedColor = parseInt(String(colorHex).replace('#', ''), 16);
                const color = Number.isNaN(parsedColor) ? 0x3B82F6 : parsedColor;

                const embed = new EmbedBuilder()
                    .setTitle(tmpl?.title || '🛍️ Confirm Your Purchase')
                    .setColor(color)
                    .setDescription(fill(tmpl?.description) || `**You are about to purchase**
${vars.product_name}.
**Details**:
${vars.product_description}`);

                if (Array.isArray(tmpl?.fields)) {
                    const fieldObjs = tmpl.fields.map((f: any) => ({
                        name: fill(f?.name) || '\u200b',
                        value: fill(f?.value) || '\u200b',
                        inline: !!f?.inline
                    }));
                    if (fieldObjs.length) embed.addFields(...fieldObjs);
                }
                if (tmpl?.thumbnail_url) embed.setThumbnail(tmpl.thumbnail_url);
                if (tmpl?.footer_text || tmpl?.footer_icon_url) {
                    embed.setFooter({ text: tmpl.footer_text || '', iconURL: tmpl.footer_icon_url || undefined });
                }

                // Build coin/network/quantity selects and action buttons
                const coinTickers = COIN_TICKERS;
                const selectedCoin = 'ETH';
                // Build safe options (filter out undefined/empty)
                const coinOptions = (() => {
                  try {
                    const arr: any[] = Array.isArray(coinTickers) ? coinTickers as any[] : Array.from(coinTickers as any);
                    return arr
                      .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
                      .map((t: string) => ({ label: t, value: t, default: t === selectedCoin }));
                  } catch {
                    return ['ETH','BTC','USDT','USDC'].map(t => ({ label: t, value: t, default: t === selectedCoin }));
                  }
                })();
                const coinSelect = new StringSelectMenuBuilder()
                  .setCustomId('coin_select')
                  .setPlaceholder('Select coin')
                  .setMinValues(1).setMaxValues(1)
                  .addOptions(coinOptions);
                const nets = NETS[selectedCoin] ?? NETS.ETH;
                const networkOptions = (() => {
                  try {
                    const list: any[] = Array.isArray(nets) ? nets : [];
                    return list
                      .filter((n: any) => n && typeof n.label === 'string' && typeof n.id === 'string' && n.label && n.id)
                      .map((n: any, i: number) => ({ label: n.label, value: n.id, default: i === 0 }));
                  } catch {
                    return [{ label: 'Ethereum Mainnet (Native)', value: 'ethereum-mainnet', default: true }];
                  }
                })();
                const networkSelect = new StringSelectMenuBuilder()
                  .setCustomId('network_select')
                  .setPlaceholder('Select network')
                  .setMinValues(1).setMaxValues(1)
                  .addOptions(networkOptions);
                const qtyOptions = Array.from({ length: 5 }, (_, i) => String(i + 1));
                const quantitySelect = new StringSelectMenuBuilder()
                  .setCustomId('qty_select')
                  .setPlaceholder('Select quantity')
                  .setMinValues(1).setMaxValues(1);
                
                // Build safe quantity options with sanitization
                const quantityOptionsLocal = (() => {
                  try {
                    const arr: any[] = Array.isArray(qtyOptions) ? qtyOptions : [];
                    return arr.slice(0, 25).map((q: any) => ({
                      label: String(q || '1'),
                      value: String(q || '1'),
                      default: String(q) === '1',
                      description: `Quantity: ${String(q || '1')}`
                    })).filter((opt: any) => opt.value && opt.label);
                  } catch {
                    return [{ label: '1', value: '1', default: true, description: 'Quantity: 1' }];
                  }
                })();
                
                if (quantityOptionsLocal.length > 0) {
                  quantitySelect.addOptions(quantityOptionsLocal);
                }
                const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder().setCustomId('confirm_order').setLabel('Confirm').setStyle(ButtonStyle.Success),
                  new ButtonBuilder().setCustomId('link_account').setLabel('Link').setStyle(ButtonStyle.Secondary)
                );
                const components = [
                  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(coinSelect),
                  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(networkSelect),
                  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(quantitySelect),
                  buttonsRow
                ];
                // Send confirmation as an ephemeral follow-up (already acked), and cache session
                const confMsg: any = await interaction.followUp({ embeds: [embed], components, flags: 64 });
                (async () => {
                  try {
                    const estLater = await botApi.getFeeEstimate({ coin: 'ETH', network: defaultNetId }, 3200);
                    if (estLater && typeof estLater.feeNative === 'number' && estLater.feeUnit && estLater.feeNative > 0) {
                      const vars2: Record<string, string> = { ...vars, network_fee: `${estLater.feeNative} ${estLater.feeUnit}` };
                      const fill2 = (s?: any) => {
                        const str = typeof s === 'string' ? s : '';
                        return str.replace(/\{(\w+)\}/g, (_m, k) => (vars2[k] ?? _m));
                      };
                      const embed2 = new EmbedBuilder()
                        .setTitle(tmpl?.title || '🛍️ Confirm Your Purchase')
                        .setColor(color)
                        .setDescription(fill2(tmpl?.description) || `**You are about to purchase**
${vars.product_name}.
**Details**:
${vars.product_description}`);
                      if (Array.isArray(tmpl?.fields)) {
                        const fieldObjs2 = tmpl.fields.map((f: any) => ({
                          name: fill2(f?.name) || '\u200b',
                          value: fill2(f?.value) || '\u200b',
                          inline: !!f?.inline
                        }));
                        if (fieldObjs2.length) embed2.addFields(...fieldObjs2);
                      }
                      if (tmpl?.thumbnail_url) embed2.setThumbnail(tmpl.thumbnail_url);
                      if (tmpl?.footer_text || tmpl?.footer_icon_url) {
                        embed2.setFooter({ text: tmpl.footer_text || '', iconURL: tmpl.footer_icon_url || undefined });
                      }
                      await interaction.webhook.editMessage(String(confMsg.id), { embeds: [embed2], components } as any);
                    }
                  } catch {}
                })();
                try {
                  if (confMsg?.id) {
                    const prev = messageId ? getBrowseSession(messageId) : null;
                    setBrowseSession(String(confMsg.id), {
                      products: Array.isArray(prev?.products) ? prev!.products : [],
                      categories: Array.isArray(prev?.categories) ? prev!.categories : [],
                      selectedProductId,
                      selectedCategoryId: (prev as any)?.selectedCategoryId,
                      selectedCoin,
                      selectedNetwork: nets[0]?.id,
                      selectedQuantity: 1
                    } as any);
                  }
                } catch {}
                return;
            }

            await interaction.reply({ content: '❓ Unknown payment method.', flags: 64 });
        } catch (e) {
            try {
                const err: any = e;
                eventLogger.error('payment_select failed', { error: err?.message, stack: err?.stack });
            } catch {}
            try {
                if (interaction.isRepliable()) {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: '❌ Failed to open confirmation.', flags: 64 });
                    } else {
                        await interaction.reply({ content: '❌ Failed to open confirmation.', flags: 64 });
                    }
                }
            } catch {}
        }
    }

    // Confirmation page select handlers
    private async handleCoinSelect(interaction: StringSelectMenuInteraction, _params: string[], values: string[]): Promise<void> {
        // Acknowledge immediately to avoid 10062 on long operations
        if (!interaction.deferred && !interaction.replied) {
            try { await interaction.deferUpdate(); } catch {}
        }
        const messageId = (interaction as any).message?.id as string | undefined;
        const selectedCoin = String(values[0] || 'ETH').toUpperCase();
        const session = messageId ? (getBrowseSession(messageId) as any) : null;

        const products: any[] = Array.isArray(session?.products) ? session!.products : [];
        const selectedProduct = products.find((p: any) => String(p?.id) === String(session?.selectedProductId));
        const priceNum = Number(selectedProduct?.price ?? 0) || 0;
        const qty = Math.max(1, Number(session?.selectedQuantity ?? 1)) || 1;
        // Live network fee via backend (OKX) for selected coin/network
        let networkFeeStr2 = 'calculating...';
        try {
            const { BotApiService } = await import('../services/botApiService');
            const botApi = BotApiService.getInstance();
            const netsLocal = NETS[selectedCoin] ?? NETS.ETH;
            const selectedNetworkIdLocal = netsLocal.some((n: any) => n.id === (session as any)?.selectedNetwork)
              ? (session as any)?.selectedNetwork
              : netsLocal[0]?.id;
            const est2 = await botApi.getFeeEstimate({ coin: selectedCoin, network: selectedNetworkIdLocal }, 3200);
            if (est2 && typeof est2.feeNative === 'number' && est2.feeUnit && est2.feeNative > 0) {
                networkFeeStr2 = `${est2.feeNative} ${est2.feeUnit}`;
            }
        } catch {}

        // Fetch confirmation template
        const { BotApiService } = await import('../services/botApiService');
        const botApi = BotApiService.getInstance();
        const serverId = interaction.guildId!;
        let templates: any[] = [];
        try {
            const tRes = (botApi as any).getServerTemplatesWithSettings
                ? await (botApi as any).getServerTemplatesWithSettings(serverId)
                : { templates: await botApi.getServerTemplates(serverId) };
            templates = Array.isArray((tRes as any)?.templates) ? (tRes as any).templates : (Array.isArray(tRes) ? (tRes as any) : []);
        } catch {}

        const templatesArr: any[] = Array.isArray(templates) ? templates : (templates && typeof templates === 'object' ? Object.values(templates as any) : []);
        const tmpl: any =
            templatesArr.find((t: any) => String(t?.id).toLowerCase() === 'confirmation_page') ??
            templatesArr.find((t: any) => String(t?.type).toLowerCase() === 'confirmation_page') ??
            templatesArr.find((t: any) => String(t?.name).toLowerCase() === 'confirmation page');

        const vars: Record<string,string> = {
            product_name: selectedProduct?.name ?? 'Unknown Item',
            product_description: selectedProduct?.description ?? 'No description',
            item_price: (priceNum * qty).toFixed(2),
            network_fee: networkFeeStr2,
            total_price: (priceNum * qty).toFixed(2),
            minecraft_username: 'Link via /link minecraft',
            crypto_currency: selectedCoin
        };
        const fill = (s?: any) => {
            const str = typeof s === 'string' ? s : '';
            return str.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] ?? _m));
        };
        const colorHex = (tmpl?.color as string) || '#3B82F6';
        const parsedColor = parseInt(String(colorHex).replace('#',''), 16);
        const color = Number.isNaN(parsedColor) ? 0x3B82F6 : parsedColor;

        const embed = new EmbedBuilder()
            .setTitle(tmpl?.title || '🛍️ Confirm Your Purchase')
            .setColor(color)
            .setDescription(fill(tmpl?.description) || `**You are about to purchase**
${vars.product_name}.
**Details**:
${vars.product_description}`);
        if (Array.isArray(tmpl?.fields)) {
            const fieldObjs = tmpl.fields.map((f: any) => ({ name: fill(f?.name) || '\u200b', value: fill(f?.value) || '\u200b', inline: !!f?.inline }));
            if (fieldObjs.length) embed.addFields(...fieldObjs);
        }
        if (tmpl?.thumbnail_url) embed.setThumbnail(tmpl.thumbnail_url);
        if (tmpl?.footer_text || tmpl?.footer_icon_url) embed.setFooter({ text: tmpl.footer_text || '', iconURL: tmpl.footer_icon_url || undefined });

        // Build components with selected defaults using sanitized options
        const coinTickers = COIN_TICKERS;
        const nets = NETS[selectedCoin] ?? NETS.ETH;
        const prevNet = session?.selectedNetwork;
        const selectedNetworkId = nets.some((n: any) => n.id === prevNet) ? prevNet : nets[0]?.id;

        // Build safe coin options (filter out undefined/empty) - mirroring initial confirmation render
        const coinOptions = (() => {
          try {
            const arr: any[] = Array.isArray(coinTickers) ? coinTickers as any[] : Array.from(coinTickers as any);
            return arr.slice(0, 25).map((t: any) => ({
              label: String(t || 'Unknown'),
              value: String(t || 'unknown'),
              default: String(t) === selectedCoin,
              description: `Select ${String(t || 'Unknown')}`
            })).filter((opt: any) => opt.value && opt.label && opt.value !== 'unknown');
          } catch {
            return [{ label: 'ETH', value: 'ETH', default: selectedCoin === 'ETH', description: 'Select ETH' }];
          }
        })();

        // Build safe network options (filter out undefined/empty)
        const networkOptions = (() => {
          try {
            const arr: any[] = Array.isArray(nets) ? nets : [];
            return arr.slice(0, 25).map((n: any) => ({
              label: String(n?.label || n?.id || 'Unknown'),
              value: String(n?.id || 'unknown'),
              default: String(n?.id) === selectedNetworkId,
              description: `Network: ${String(n?.label || n?.id || 'Unknown')}`
            })).filter((opt: any) => opt.value && opt.label && opt.value !== 'unknown');
          } catch {
            return [{ label: 'Ethereum', value: 'ethereum-mainnet', default: true, description: 'Network: Ethereum' }];
          }
        })();

        // Build safe quantity options
        const quantityOptions = (() => {
          try {
            return Array.from({length: 5}, (_, i) => String(i + 1)).map((q: string) => ({
              label: q,
              value: q,
              default: q === String(qty),
              description: `Quantity: ${q}`
            }));
          } catch {
            return [{ label: '1', value: '1', default: true, description: 'Quantity: 1' }];
          }
        })();

        // Create select menus with sanitized options
        const coinSelect = new StringSelectMenuBuilder()
          .setCustomId('coin_select').setPlaceholder('Select coin').setMinValues(1).setMaxValues(1);
        if (coinOptions.length > 0) {
          coinSelect.addOptions(coinOptions);
        }

        const networkSelect = new StringSelectMenuBuilder()
          .setCustomId('network_select').setPlaceholder('Select network').setMinValues(1).setMaxValues(1);
        if (networkOptions.length > 0) {
          networkSelect.addOptions(networkOptions);
        }

        const quantitySelect = new StringSelectMenuBuilder()
          .setCustomId('qty_select').setPlaceholder('Select quantity').setMinValues(1).setMaxValues(1);
        if (quantityOptions.length > 0) {
          quantitySelect.addOptions(quantityOptions);
        }
        const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('confirm_order').setLabel('Confirm').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('link_account').setLabel('Link').setStyle(ButtonStyle.Secondary)
        );
        const payload = {
            embeds: [embed],
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(coinSelect),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(networkSelect),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(quantitySelect),
                buttonsRow
            ]
        };
        try {
            await interaction.webhook.editMessage(String((interaction as any).message?.id), payload as any);
        } catch (_e) {
            try { await interaction.followUp({ ...payload, flags: 64 } as any); } catch {}
        }
        if (messageId) updateBrowseSession(messageId, { selectedCoin, selectedNetwork: selectedNetworkId } as any);
    }

    private async handleNetworkSelect(interaction: StringSelectMenuInteraction, _params: string[], values: string[]): Promise<void> {
        const messageId = (interaction as any).message?.id as string | undefined;
        if (messageId) updateBrowseSession(messageId, { selectedNetwork: String(values[0]) } as any);
        const session = messageId ? (getBrowseSession(messageId) as any) : null;
        await this.handleCoinSelect(interaction, [], [String(session?.selectedCoin || 'ETH')]);
    }

    private async handleQtySelect(interaction: StringSelectMenuInteraction, _params: string[], values: string[]): Promise<void> {
        const messageId = (interaction as any).message?.id as string | undefined;
        const q = Math.max(1, Math.min(5, Number(values[0] || 1)));
        if (messageId) updateBrowseSession(messageId, { selectedQuantity: q } as any);
        const session = messageId ? (getBrowseSession(messageId) as any) : null;
        await this.handleCoinSelect(interaction, [], [String(session?.selectedCoin || 'ETH')]);
    }

    // Modal handler methods
    private async handleMinecraftModal(interaction: ModalSubmitInteraction, params: string[]): Promise<void> {
        await interaction.reply({
            content: '⛏️ Minecraft modal processing coming soon!',
            flags: 64
        });
    }

    private async handleInvoiceButton(interaction: ButtonInteraction, params: string[]): Promise<void> {
        if (!interaction.deferred && !interaction.replied) {
            try { await interaction.deferUpdate(); } catch {}
        }
        const msgId = String((interaction as any).message?.id || '');
        
        console.log('handleInvoiceButton - Message ID extraction:', {
            rawMessageId: (interaction as any).message?.id,
            stringMessageId: msgId,
            messageExists: !!(interaction as any).message,
            interactionType: interaction.type,
            customId: interaction.customId
        });
        
        const session: any = msgId ? getBrowseSession(msgId) : null;
        const orderId = session?.orderId;
        const walletAddress = session?.walletAddress;

        try {
            if (interaction.customId === 'invoice_check') {
                // Import listAllSessions for debugging
                const { listAllSessions } = await import('../utils/browseSessionStore');
                const allSessions = listAllSessions();
                
                // Debug logging
                console.log('Invoice check debug:', {
                    msgId,
                    hasSession: !!session,
                    sessionKeys: session ? Object.keys(session) : [],
                    orderId,
                    sessionOrderId: session?.orderId,
                    fullSession: session,
                    allSessions: allSessions
                });
                
                if (!orderId) { 
                    const debugInfo = `msgId=${msgId}, hasSession=${!!session}, sessionKeys=${session ? Object.keys(session).join(',') : 'none'}, totalSessions=${allSessions.length}`;
                    await interaction.followUp({ 
                        content: `ℹ️ No order to check. The session may have expired. Please create a new invoice.\n\nDebug: ${debugInfo}`, 
                        flags: 64 
                    }); 
                    return; 
                }
                
                try {
                    // Use manual payment checking via API
                    const apiService = (await import('../services/botApiService')).BotApiService.getInstance();
                    const checkResult = await apiService.checkPaymentStatus(orderId);
                    
                    const { PaymentService } = await import('../services/paymentService');
                    const ps = PaymentService.getInstance();
                    
                    let statusMessage = `Status: ${ps.getPaymentStatusEmoji(checkResult.status)} **${checkResult.status.toUpperCase()}**\n`;
                    
                    if (checkResult.status === 'paid') {
                        statusMessage += `✅ Payment confirmed!\n`;
                        statusMessage += `💰 Received: ${checkResult.receivedAmount.toFixed(8)} ${checkResult.currency || 'crypto'}\n`;
                        if (checkResult.transactionHash) {
                            statusMessage += `🔗 TX: \`${checkResult.transactionHash.slice(0, 16)}...\``;
                        }
                    } else if (checkResult.status === 'pending') {
                        statusMessage += `⏳ Waiting for payment...\n`;
                        statusMessage += `💰 Expected: ${checkResult.expectedAmount.toFixed(8)} ${checkResult.currency || 'crypto'}\n`;
                        if (checkResult.receivedAmount > 0) {
                            statusMessage += `📥 Received: ${checkResult.receivedAmount.toFixed(8)} (partial)`;
                        }
                    } else if (checkResult.status === 'expired') {
                        statusMessage += `⏰ Order has expired. Please create a new invoice.`;
                    }
                    
                    await interaction.followUp({ content: statusMessage, flags: 64 });
                } catch (error: any) {
                    console.error('Payment check failed:', error);
                    await interaction.followUp({ 
                        content: '❌ Failed to check payment status. Please try again.', 
                        flags: 64 
                    });
                }
                return;
            }
            if (interaction.customId === 'invoice_copy') {
                if (!walletAddress) { await interaction.followUp({ content: 'ℹ️ No address available.', flags: 64 }); return; }
                await interaction.followUp({ content: `Address: ${walletAddress}`, flags: 64 });
                return;
            }
            await interaction.followUp({ content: 'ℹ️ Invoice action.', flags: 64 });
        } catch {
            try { await interaction.followUp({ content: '❌ Failed.', flags: 64 }); } catch {}
        }
    }

    private async handleAdminModal(interaction: ModalSubmitInteraction, params: string[]): Promise<void> {
        await interaction.reply({
            content: '⚙️ Admin modal processing coming soon!',
            flags: 64
        });
    }

    // Autocomplete handler methods
    private async handleShopAutocomplete(interaction: AutocompleteInteraction, focusedOption: any): Promise<void> {
        const choices: Array<{ name: string; value: string }> = [];

        if (focusedOption.name === 'product') {
            // This will be implemented when we have product search
            choices.push(
                { name: 'Example Product 1', value: 'product_1' },
                { name: 'Example Product 2', value: 'product_2' }
            );
        }

        await interaction.respond(choices.slice(0, 25)); // Discord limit is 25 choices
    }

    private async handleConfirmButton(interaction: ButtonInteraction, _params: string[]): Promise<void> {
        // Acknowledge quickly to avoid "interaction failed"
        if (!interaction.deferred && !interaction.replied) {
            try { await interaction.deferUpdate(); } catch {}
        }

        try {
            const serverId = interaction.guildId!;
            const userId = interaction.user.id;
            const messageId = String((interaction as any).message?.id || '');

            // Read session (built when confirmation page was created)
            const session: any = messageId ? getBrowseSession(messageId) : null;
            const products: any[] = Array.isArray(session?.products) ? session.products : [];
            const selectedProductId = session?.selectedProductId;
            const selectedProduct = products.find(p => String(p?.id) === String(selectedProductId));
            const qty = Math.max(1, Number(session?.selectedQuantity ?? 1)) || 1;
            const coin = String(session?.selectedCoin || 'ETH').toUpperCase();
            const network = String(session?.selectedNetwork || 'ethereum-mainnet');

            if (!selectedProduct) {
                await interaction.followUp({ content: '⚠️ Please select a product first.', flags: 64 });
                return;
            }

            // Build payment request and create order
            const { BotApiService } = await import('../services/botApiService');
            const api = BotApiService.getInstance();

            // Derive price and currency (fallbacks)
            const priceNum = Number(selectedProduct?.price ?? 0) || 0;
            const itemTotal = (priceNum * qty);
            const currency = coin; // pay in selected coin

            const paymentRequest: any = {
                serverId,
                userId,
                discordUserId: userId,
                products: [{ id: String(selectedProductId), quantity: qty }],
                paymentMethod: false,
                discordChannelId: String(interaction.channelId || ''),
                metadata: {
                    source: 'discord_bot',
                    messageId
                }
            };

            const created = await api.createPaymentOrder(paymentRequest);
            // Fetch order status/details if needed
            let order: any = null;
            try {
                order = created?.id ? await api.getPaymentOrderStatus(created.id) : null;
            } catch {}

            // Prepare invoice variables (prefer backend PaymentOrder fields)
            const walletAddress = created?.cryptoInfo?.address || '';
            const exactAmount = created?.cryptoInfo?.amount ? Number(created.cryptoInfo.amount) : itemTotal;
            const cryptoCurrency = created?.cryptoInfo?.coin || currency;
            const expiresIso = created?.expiresAt;
            const expiresTs = expiresIso ? Math.floor(new Date(expiresIso).getTime() / 1000) : Math.floor(Date.now() / 1000) + 1800;

            // Load invoice_page template
            let templates: any[] = [];
            try {
                const tRes = await api.getServerTemplatesWithSettings(serverId);
                templates = Array.isArray((tRes as any)?.templates) ? (tRes as any).templates : (Array.isArray(tRes) ? (tRes as any) : []);
            } catch {}

            const tmplArr: any[] = Array.isArray(templates) ? templates : (templates && typeof templates === 'object' ? Object.values(templates as any) : []);
            const tmpl: any =
                tmplArr.find((t: any) => String(t?.id).toLowerCase() === 'invoice_page') ??
                tmplArr.find((t: any) => String(t?.type).toLowerCase() === 'invoice_page') ??
                tmplArr.find((t: any) => String(t?.name).toLowerCase() === 'invoice page');

            // Build embed using template + variable replacement
            const vars: Record<string, string> = {
                product_name: selectedProduct?.name ?? 'Unknown Item',
                product_description: selectedProduct?.description ?? 'No description',
                item_price: itemTotal.toFixed(2),
                wallet_address: walletAddress || 'N/A',
                exact_amount: String(exactAmount),
                crypto_currency: cryptoCurrency
            };
            const fill = (s?: any) => {
                const str = typeof s === 'string' ? s : '';
                let replaced = str.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] ?? _m));
                // Render Discord timestamp as countdown and ensure it is not wrapped in backticks
                replaced = replaced
                  .replace(/<t:1800seconds:F>/g, `<t:${expiresTs}:R>`)
                  .replace(/<t:1800seconds:R>/g, `<t:${expiresTs}:R>`)
                  .replace(/`<t:(\d+):([A-Za-z])>`/g, '<t:$1:$2>');
                return replaced;
            };

            const colorHex = (tmpl?.color as string) || '#10B981';
            const parsedColor = parseInt(String(colorHex).replace('#', ''), 16);
            const color = Number.isNaN(parsedColor) ? 0x10B981 : parsedColor;

            const embed = new EmbedBuilder()
                .setTitle(tmpl?.title || '🧾 Payment Invoice')
                .setColor(color)
                .setDescription(fill(tmpl?.description) || 'Scan the QR code or copy the details below to complete your payment.')
            ;

            if (tmpl?.banner_url) embed.setImage(tmpl.banner_url);
            // Prefer QR image returned by backend if available
            if ((created as any)?.cryptoInfo?.qrCode) {
                try { embed.setImage(String((created as any).cryptoInfo.qrCode)); } catch {}
            }
            if (tmpl?.thumbnail_url) embed.setThumbnail(tmpl.thumbnail_url);
            if (tmpl?.footer_text || tmpl?.footer_icon_url) embed.setFooter({ text: tmpl.footer_text || '', iconURL: tmpl.footer_icon_url || undefined });

            if (Array.isArray(tmpl?.fields)) {
                const fieldObjs = tmpl.fields.map((f: any) => ({
                    name: fill(f?.name) || '\u200b',
                    value: fill(f?.value) || '\u200b',
                    inline: !!f?.inline
                }));
                if (fieldObjs.length) embed.addFields(...fieldObjs);
            } else {
                embed.addFields(
                    { name: '✅ Product Name', value: `\`${vars.product_name}\``, inline: true },
                    { name: '✅ Product Description', value: `\`${vars.product_description}\``, inline: true },
                    { name: '💵 Price', value: `\`${vars.item_price}\``, inline: false },
                    { name: '🏠 Send To Address', value: `\`${vars.wallet_address}\``, inline: false },
                    { name: '💰 Exact Amount', value: `\`${vars.exact_amount} ${vars.crypto_currency}\``, inline: false },
                    { name: '⏰ Expires at', value: `<t:${expiresTs}:R>`, inline: false }
                );
            }

            // Optional: buttons (copy address / check status)
            const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('invoice_check').setLabel('Check Status').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('invoice_copy').setLabel('Copy Address').setStyle(ButtonStyle.Secondary)
            );

            // Persist order info into session BEFORE editing message (for check status)
            try {
                if (messageId) {
                    const sessionData = {
                        orderId: created?.id || order?.id,
                        orderNumber: created?.orderNumber || order?.order_number,
                        walletAddress,
                        exactAmount,
                        cryptoCurrency,
                        expiresAt: expiresIso || (new Date(expiresTs * 1000)).toISOString()
                    };
                    
                    console.log('Updating session with order data BEFORE message edit:', {
                        messageId,
                        sessionData,
                        createdId: created?.id,
                        orderId: created?.id || order?.id
                    });
                    
                    updateBrowseSession(messageId, sessionData as any);
                    
                    // Verify session was updated
                    const verifySession = getBrowseSession(messageId);
                    console.log('Session verification after update:', {
                        messageId,
                        hasSession: !!verifySession,
                        hasOrderId: !!verifySession?.orderId,
                        orderId: verifySession?.orderId
                    });
                }
            } catch (error) {
                console.error('Failed to update session:', error);
            }

            // Replace current confirmation page with invoice page
            const originalMessageId = String((interaction as any).message?.id);
            console.log('Editing message with invoice:', {
                originalMessageId,
                messageIdMatch: originalMessageId === messageId,
                hasEmbed: !!embed,
                hasButtons: !!buttonsRow
            });
            
            try {
                await interaction.webhook.editMessage(originalMessageId, {
                    embeds: [embed],
                    components: [buttonsRow]
                } as any);
                console.log('✅ Successfully edited message to invoice');
            } catch (_e) {
                console.log('❌ Failed to edit message, using followUp:', _e);
                // Fallback if edit fails
                try { await interaction.followUp({ embeds: [embed], components: [buttonsRow], flags: 64 } as any); } catch {}
            }

        } catch (e) {
            try { await interaction.followUp({ content: '❌ Failed to create invoice. Please try again.', flags: 64 }); } catch {}
        }
    }

    private async handleAdminAutocomplete(interaction: AutocompleteInteraction, focusedOption: any): Promise<void> {
        const choices: Array<{ name: string; value: string }> = [];

        if (focusedOption.name === 'setting') {
            choices.push(
                { name: 'Bot Settings', value: 'bot_settings' },
                { name: 'Payment Settings', value: 'payment_settings' },
                { name: 'Template Settings', value: 'template_settings' }
            );
        }

        await interaction.respond(choices.slice(0, 25));
    }

    /**
     * Get interaction statistics
     */
    public getInteractionStats(): Record<string, number> {
        // This would be implemented with actual tracking
        return {
            slashCommands: 0,
            buttonClicks: 0,
            selectMenus: 0,
            modals: 0,
            autocomplete: 0
        };
    }
}
