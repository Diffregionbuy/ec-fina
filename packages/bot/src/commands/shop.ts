import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { Command } from '../types';
import { commandLogger } from '../utils/logger';

const shopCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse and purchase products')
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('Browse available products')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Filter by category')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cart')
                .setDescription('View your shopping cart')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('orders')
                .setDescription('View your order history')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('home')
                .setDescription('Show the public homepage')
        ),
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId) {
            await interaction.reply({
                content: '❌ This command can only be used in a server.',
                flags: 64
            });
            return;
        }

        try {
            const subcommand = interaction.options.getSubcommand();
            if (!interaction.deferred && !interaction.replied) {
                if (subcommand === 'browse') {
                    // Send a private placeholder immediately; we'll edit it below
                    await interaction.reply({ content: 'Loading…', flags: 64 });
                } else {
                    await interaction.deferReply();
                }
            }

            switch (subcommand) {
                case 'browse':
                    await handleBrowse(interaction);
                    break;
                case 'cart':
                    await handleCart(interaction);
                    break;
                case 'orders':
                    await handleOrders(interaction);
                    break;
                case 'home':
                    await handleHome(interaction);
                    break;
                default:
                    await interaction.editReply({
                        content: '❌ Unknown subcommand.'
                    });
            }
        } catch (error) {
            commandLogger.error('Shop command error:', error);
            const msg = '❌ An error occurred while processing your request.';
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: msg });
                } else {
                    await interaction.reply({ content: msg, flags: 64 });
                }
            } catch {
                try {
                    await interaction.followUp({ content: msg, flags: 64 });
                } catch {}
            }
        }
    },
    
    guildOnly: true,
    cooldown: 3
};

async function handleBrowse(interaction: ChatInputCommandInteraction): Promise<void> {
    const { BotApiService } = await import('../services/botApiService');
    
    try {
        const serverId = interaction.guildId!;
        const categoryFilter = interaction.options.getString('category');
        
        // Fetch products and categories
        const botApi = BotApiService.getInstance();

        const [products, categories] = await Promise.all([
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
            if (e?.code === 'BOT_NOT_CONFIGURED') {
                await interaction.editReply({ content: 'Go to http://localhost:3000/ to set the bot' });
                return;
            }
            throw e;
        }

        // Normalize API responses to arrays
        const productsArr = Array.isArray(products)
            ? products
            : Array.isArray((products as any)?.products) ? (products as any).products
            : Array.isArray((products as any)?.items) ? (products as any).items
            : Array.isArray((products as any)?.data) ? (products as any).data
            : [];
        const categoriesArr = Array.isArray(categories)
            ? categories
            : Array.isArray((categories as any)?.categories) ? (categories as any).categories
            : Array.isArray((categories as any)?.items) ? (categories as any).items
            : Array.isArray((categories as any)?.data) ? (categories as any).data
            : [];

        // Templates array
        const templatesArr: any[] = Array.isArray(templates)
            ? templates
            : (templates && typeof templates === 'object' ? Object.values(templates as any) : []);

        // Locate private_main_menu template (robust: id/type/name, case-insensitive)
        const menuTmpl: any =
            templatesArr.find((t: any) => String(t?.id).toLowerCase() === 'private_main_menu') ??
            templatesArr.find((t: any) => String(t?.type).toLowerCase() === 'private_main_menu') ??
            templatesArr.find((t: any) => String(t?.name).toLowerCase() === 'private main menu') ??
            templatesArr.find((t: any) => (t?.product_display_settings || t?.productDisplaySettings)) ??
            templatesArr[0];

        // Color parse helper
        const hex = (menuTmpl?.color as string) || '#0099FF';
        const parsedColor = parseInt(String(hex).replace('#', ''), 16);
        const color = Number.isNaN(parsedColor) ? 0x0099FF : parsedColor;

        // Build embeds: 1) banner image, 2) main body, 3) one embed per category
        const embeds: EmbedBuilder[] = [];

        // 1) Banner
        if (menuTmpl?.banner_url) {
            embeds.push(new EmbedBuilder().setColor(color).setImage(menuTmpl.banner_url));
        }

        // 2) Main body from template
        const main = new EmbedBuilder()
            .setTitle(menuTmpl?.title || 'Game Shop')
            .setColor(color)
            .setDescription(menuTmpl?.description || 'Welcome to your private shopping panel!');
        if (menuTmpl?.thumbnail_url) main.setThumbnail(menuTmpl.thumbnail_url);
        if (Array.isArray(menuTmpl?.fields) && menuTmpl.fields.length > 0) {
            main.addFields(...menuTmpl.fields.map((f: any) => ({
                name: f?.name ?? '\\u200b',
                value: f?.value ?? '\\u200b',
                inline: !!f?.inline
            })));
        }
        // Footer will be applied to the last embed after category embeds
        embeds.push(main);

        // Product display settings (scan multiple possible locations and across templates; case-insensitive)
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
        // prefer settings from the target template; if missing, fall back to any template that defines them
        const sources = [
            menuTmpl,
            ...(Array.isArray(templatesArr) ? templatesArr : []),
            ...(globalPds ? [{ product_display_settings: globalPds }] : [])
        ];
        let pdsOwner: any = null;
        let pds: any = {};
        let rawMode: any = '';
        for (const t of sources) {
            const { pds: cand, rawMode: candMode } = getPds(t);
            const hasMode = typeof candMode === 'string' && candMode.trim() !== '';
            const hasAny =
                hasMode ||
                cand?.showProducts !== undefined ||
                cand?.show_products !== undefined;
            if (hasAny) {
                pds = cand || {};
                rawMode = candMode || '';
                pdsOwner = t;
                break;
            }
        }
        const showProductsRaw =
            (pds as any)?.showProducts ??
            (pds as any)?.show_products ??
            (menuTmpl as any)?.showProducts ??
            true;
        const showProducts = !(String(showProductsRaw).toLowerCase() === 'false' || showProductsRaw === false);
        const modeStr = typeof rawMode === 'string' ? rawMode.toLowerCase().trim() : '';
        const layout: 'vertical' | 'horizontal' =
            modeStr === 'vertical' || modeStr === 'v' || modeStr === 'list' ? 'vertical' : 'horizontal';
        // Debug: log resolved layout and settings, including which template provided PDS
        commandLogger.info('Shop browse layout', {
            resolvedLayout: layout,
            rawMode,
            modeStr,
            showProducts,
            hasMenuTmpl: !!menuTmpl,
            hasGlobalPds: !!globalPds,
            pdsOwnerId: pdsOwner?.id || pdsOwner?.type || pdsOwner?.name || null,
            pds
        });

        // Filter by category option if provided
        const visibleCategories = categoryFilter
            ? categoriesArr.filter((c: any) => c.id === categoryFilter)
            : categoriesArr;

        // Now compute category slots (Discord max 10 embeds per message)
        const remainingSlots = Math.max(0, 10 - embeds.length);
        const categorySlice = visibleCategories.slice(0, remainingSlots);

        // Helper to format product lines
        const short = (s: any, max = 80) => {
            const str = typeof s === 'string' ? s : (s ? String(s) : '');
            return str.length > max ? str.slice(0, max - 1) + '…' : str;
        };
        const fmtPrice = (p: any, cur: any) => {
            const price = (typeof p === 'number' || typeof p === 'string') ? p : '';
            const c = typeof cur === 'string' ? cur : '';
            return price !== '' ? `${price}${c ? ' ' + c : ''}` : '';
        };

        // 3) One embed per category with products
        for (const cat of categorySlice) {
            const catEmbed = new EmbedBuilder()
                .setTitle(cat.name || 'Category')
                .setColor(color)
                .setDescription(cat.description || `${cat.name ? cat.name + ' ' : ''}items`);

            if (showProducts) {
                const catProducts = productsArr.filter((p: any) => p?.category_id === cat.id && (p?.is_active ?? true));
                const toShow = catProducts.slice(0, 10); // keep fields under 25

                if (layout === 'vertical') {
                    toShow.forEach((p: any) => {
                        const price = fmtPrice(p?.price, p?.currency);
                        const ratingLine = (typeof p?.rating_avg === 'number' && typeof p?.rating_count === 'number' && Number(p.rating_count) > 0)
                            ? `
> ${Number(p.rating_avg).toFixed(1)}/5 from ${p.rating_count} deals`
                            : ((p?.rating || p?.reviews_avg) ? `
> ${(p?.rating || p?.reviews_avg)}/5` : `
> No ratings yet`);
                        const desc = short(p?.description, 100);
                        catEmbed.addFields({
                            name: p?.name || 'Unnamed',
                            value: `> ${desc || 'No description'}${price ? `
> ${price}` : ''}${ratingLine}`,
                            inline: false
                        });
                    });
                } else {
                    toShow.forEach((p: any) => {
                        const price = fmtPrice(p?.price, p?.currency);
                        const ratingLine = (typeof p?.rating_avg === 'number' && typeof p?.rating_count === 'number' && Number(p.rating_count) > 0)
                            ? `
> ${Number(p.rating_avg).toFixed(1)}/5 from ${p.rating_count} deals`
                            : ((p?.rating || p?.reviews_avg) ? `
> ${(p?.rating || p?.reviews_avg)}/5` : `
> No ratings yet`);
                        const desc = short(p?.description, 80);
                        catEmbed.addFields({
                            name: p?.name || 'Unnamed',
                            value: `> ${desc || 'No description'}${price ? `
> ${price}` : ''}${ratingLine}`,
                            inline: true
                        });
                    });
                }
            }

            // If category has an image, attach it to the category embed
            const catImage = (cat as any)?.image_url || (cat as any)?.banner_url;
            if (catImage) {
                catEmbed.setImage(catImage);
            }
            embeds.push(catEmbed);
        }

        // Apply footer to the last embed if provided on template
        if (menuTmpl?.footer_text || menuTmpl?.footer_icon_url) {
            const last = embeds[embeds.length - 1];
            if (last) {
                last.setFooter({ text: menuTmpl.footer_text || '', iconURL: menuTmpl.footer_icon_url || undefined });
            }
        }
        // Build dropdown components for browse
        const components: ActionRowBuilder<any>[] = [];
        try {
            const categoryOptions = (Array.isArray(categoriesArr) ? categoriesArr : [])
                .slice(0, 25)
                .map((c: any) => ({
                    label: String(c?.name ?? 'Unnamed'),
                    value: String(c?.id ?? ''),
                    description: (typeof c?.description === 'string' && c.description.length ? (c.description.length > 50 ? c.description.slice(0, 49) + '…' : c.description) : undefined)
                }))
                .filter(o => o.value && o.label);

            const productOptions = (Array.isArray(productsArr) ? productsArr : [])
                .slice(0, 25)
                .map((p: any) => {
                    const name = typeof p?.name === 'string' && p.name.length ? p.name : 'Unnamed';
                    const descRaw = typeof p?.description === 'string' ? p.description : '';
                    const desc = descRaw ? (descRaw.length > 50 ? descRaw.slice(0, 49) + '…' : descRaw) : '';
                    const price = fmtPrice(p?.price, p?.currency);
                    const description = [desc, price].filter(Boolean).join(' • ') || undefined;
                    return {
                        label: name.length > 100 ? name.slice(0, 99) + '…' : name,
                        value: String(p?.id ?? ''),
                        description
                    };
                })
                .filter(o => o.value && o.label);

            const categorySelect = new StringSelectMenuBuilder()
                .setCustomId('category_select')
                .setPlaceholder('Select category')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                    categoryOptions.length
                        ? categoryOptions
                        : [{ label: 'No categories', value: 'none', description: 'No categories available' }]
                );

            const productSelect = new StringSelectMenuBuilder()
                .setCustomId('product_select')
                .setPlaceholder('Select product')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(true)
                .addOptions({ label: 'Select a category first', value: 'placeholder', description: 'Choose a category to see products' });

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

            components.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(productSelect),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(paymentSelect)
            );
        } catch {}

        const msg = await interaction.editReply({ embeds, components });
        // Cache products and categories per message to avoid extra API calls on selects
        try {
            const { setBrowseSession } = await import('../utils/browseSessionStore');
            const normalizedProducts = Array.isArray(productsArr) ? productsArr : [];
            const normalizedCategories = Array.isArray(categoriesArr) ? categoriesArr : [];
            setBrowseSession(msg.id, {
                products: normalizedProducts,
                categories: normalizedCategories
            });
        } catch {}

        logCommand('shop_browse', interaction.user.id, interaction.guildId || undefined, true);

    } catch (error) {
        commandLogger.error('Shop browse error:', error);
        await interaction.editReply({
            content: '❌ Failed to load shop. Please try again later.'
        });
        logCommand('shop_browse', interaction.user.id, interaction.guildId || undefined, false, error as string);
    }
}

async function handleHome(interaction: ChatInputCommandInteraction): Promise<void> {
    const { BotApiService } = await import('../services/botApiService');
    const serverId = interaction.guildId!;
    const botApi = BotApiService.getInstance();

    let templates: any[] = [];
    try {
        templates = await botApi.getServerTemplates(serverId);
    } catch (e: any) {
        await interaction.editReply({ content: 'Go to http://localhost:3000/ to set the bot' });
        return;
    }

    if (!Array.isArray(templates) || templates.length === 0) {
        await interaction.editReply({ content: 'Go to http://localhost:3000/ to set the bot' });
        return;
    }

    const tmpl = templates.find((t: any) => t?.id === 'public_homepage');

    const fallbackTitle = 'Game Shop';
    const fallbackDesc = 'Welcome to our premium gaming shop!\n\nChoose from the options below to get started!';
    const colorHex = (tmpl?.color as string) || '#0099FF';
    const parsed = parseInt(String(colorHex).replace('#', ''), 16);
    const color = Number.isNaN(parsed) ? 0x0099FF : parsed;

    const main = new EmbedBuilder()
        .setTitle(tmpl?.title || fallbackTitle)
        .setColor(color)
        .setDescription(tmpl?.description || fallbackDesc);

    if (tmpl?.thumbnail_url) main.setThumbnail(tmpl.thumbnail_url);
    if (Array.isArray(tmpl?.fields) && tmpl.fields.length > 0) {
        main.addFields(...tmpl.fields.map((f: any) => ({
            name: f?.name ?? '\u200b',
            value: f?.value ?? '\u200b',
            inline: !!f?.inline
        })));
    }
    // Footer will be applied to the last embed before sending

    const embeds: EmbedBuilder[] = [];
    if (tmpl?.banner_url) {
        embeds.push(new EmbedBuilder().setColor(color).setImage(tmpl.banner_url));
    }
    embeds.push(main);



    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('home_start')
                .setLabel('🛍️ Start Shopping')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('home_link_mc')
                .setLabel('⛏️ Link to Minecraft')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('home_reviews')
                .setLabel('⭐ Check Reviews')
                .setStyle(ButtonStyle.Secondary)
        );

    // Apply footer to last embed if available
    if (tmpl?.footer_text || tmpl?.footer_icon_url) {
        const last = embeds[embeds.length - 1];
        if (last) {
            last.setFooter({ text: tmpl.footer_text || '', iconURL: tmpl.footer_icon_url || undefined });
        }
    }
    await interaction.editReply({ embeds, components: [row] });
}

async function handleCart(interaction: ChatInputCommandInteraction): Promise<void> {
    // Placeholder for cart functionality
    const cartEmbed = new EmbedBuilder()
        .setTitle('🛒 Shopping Cart')
        .setColor(0x0099FF)
        .setDescription('Your shopping cart is empty.')
        .addFields(
            {
                name: '🔄 Status',
                value: 'Cart system under development',
                inline: true
            },
            {
                name: '📋 Features Coming Soon',
                value: '• Add/remove items\n• Quantity management\n• Checkout process\n• Save for later',
                inline: false
            }
        );

    const shopButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back_to_shop')
                .setLabel('🛍️ Back to Shop')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.editReply({
        embeds: [cartEmbed],
        components: [shopButton]
    });
}

async function handleOrders(interaction: ChatInputCommandInteraction): Promise<void> {
    // Placeholder for order history
    const ordersEmbed = new EmbedBuilder()
        .setTitle('📋 Order History')
        .setColor(0x0099FF)
        .setDescription('You have no previous orders.')
        .addFields(
            {
                name: '🔄 Status',
                value: 'Order system under development',
                inline: true
            },
            {
                name: '📋 Features Coming Soon',
                value: '• Order tracking\n• Payment status\n• Download links\n• Order details',
                inline: false
            }
        );

    const shopButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back_to_shop')
                .setLabel('🛍️ Back to Shop')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.editReply({
        embeds: [ordersEmbed],
        components: [shopButton]
    });
}

function createDefaultShopEmbed(products: any[], categories: any[], categoryFilter?: string | null): EmbedBuilder {
    // Normalize inputs to arrays to avoid runtime errors from API shape
    products = Array.isArray(products) ? products : [];
    categories = Array.isArray(categories) ? categories : [];
    const embed = new EmbedBuilder()
        .setTitle('🛍️ Shop')
        .setColor(0x0099FF);

    let description = `Welcome to the shop! We have **${products.length}** products available`;
    
    if (categoryFilter) {
        const category = categories.find((cat: any) => cat.id === categoryFilter);
        description += ` in **${category?.name || 'Selected Category'}**`;
    }
    
    embed.setDescription(description);

    // Add product fields (limit to 10 for readability)
    const displayProducts = products.slice(0, 10);
    displayProducts.forEach((product: any, index: number) => {
        const category = categories.find((cat: any) => cat.id === product.category_id);
        embed.addFields({
            name: `${index + 1}. ${product.name}`,
            value: `💰 $${product.price}\n📂 ${category?.name || 'Uncategorized'}\n${product.description?.substring(0, 50) || 'No description'}${product.description?.length > 50 ? '...' : ''}`,
            inline: true
        });
    });

    if (products.length > 10) {
        embed.setFooter({
            text: `Showing 10 of ${products.length} products`
        });
    }

    return embed;
}

function createShopComponents(products: any[], categories: any[]): ActionRowBuilder<ButtonBuilder>[] {
    // Normalize inputs to arrays
    products = Array.isArray(products) ? products : [];
    categories = Array.isArray(categories) ? categories : [];
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    // Category selection buttons (if there are categories)
    if (categories.length > 0) {
        const categoryButtons = new ActionRowBuilder<ButtonBuilder>();
        
        categories.slice(0, 4).forEach((category: any) => {
            categoryButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`category_${category.id}`)
                    .setLabel(category.name)
                    .setStyle(ButtonStyle.Secondary)
            );
        });

        if (categories.length > 0) {
            categoryButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId('category_all')
                    .setLabel('All Categories')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        components.push(categoryButtons);
    }

    return components;
}

function logCommand(command: string, userId: string, guildId: string | undefined, success: boolean, error?: string): void {
    commandLogger.info('Shop command executed', {
        command,
        userId,
        guildId,
        success,
        error
    });
}

export default shopCommand;