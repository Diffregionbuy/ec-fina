'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Bot, Save } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Category, Product } from '@/types/dashboard';
import { EmbedTemplate, BotTemplates, ProductDisplaySettings } from '@/types/botTemplates';
import TemplatePreview from './embeds/TemplatePreview';

interface BotSettingsProps {
    serverId: string;
}






export function BotSettings({ serverId }: BotSettingsProps) {
    const { toasts, removeToast, success, error: showError } = useToast();
    const [saving, setSaving] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [productDisplaySettings, setProductDisplaySettings] = useState<ProductDisplaySettings>({
        showProducts: true,
        displayMode: 'horizontal'
    });

    // Channel selector state
    const [channels, setChannels] = useState<Array<{id: string, name: string}>>([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [selectedVouchChannel, setSelectedVouchChannel] = useState<string>('');

    // Preview dropdown states for Private Main Menu
    const [previewSelectedCategory, setPreviewSelectedCategory] = useState<string>('');
    const [previewSelectedProduct, setPreviewSelectedProduct] = useState<string>('');
    const [previewSelectedQuantity, setPreviewSelectedQuantity] = useState<string>('');
    const [previewSelectedPaymentMethod, setPreviewSelectedPaymentMethod] = useState<string>('');

    // Preview dropdown states for Confirmation Page
    const [confirmationCrypto, setConfirmationCrypto] = useState<string>('');
    const [confirmationNetwork, setConfirmationNetwork] = useState<string>('');

    // Editable note for confirmation page
    const [confirmationNote, setConfirmationNote] = useState<string>('⚠️ Note: Estimated network fees are shown below. For lower fees, consider using a different cryptocurrency.');

    // Editable footer message for vouch page
    const [vouchFooterMessage, setVouchFooterMessage] = useState<string>('Thank you for sharing your experience with our community!');

    // Payment methods options
    const paymentMethods = [
        { id: 'crypto', name: 'Crypto - Integrate with 300+coins ', emoji: '🪙' },
        { id: 'paypal', name: 'Fiat   - Secured by Stripe', emoji: '💳' },
    ];

    // Crypto options for confirmation page
    const cryptoOptions = [
        { id: 'bitcoin', name: 'Bitcoin', emoji: '₿' },
        { id: 'ethereum', name: 'Ethereum', emoji: 'Ξ' },
        { id: 'usdt', name: 'Tether', emoji: '₮' },
    ];

    // Network options for confirmation page
    const networkOptions = [
        { id: 'ethereum', name: 'Ethereum', emoji: '🔷' },
        { id: 'bsc', name: 'Binance Smart Chain', emoji: '🟡' },
    ];

    // Template states
    const [templates, setTemplates] = useState<BotTemplates>({
        public_homepage: {
            id: 'public_homepage',
            name: 'Public Homepage',
            title: 'Game Shop',
            description: 'Welcome to our premium gaming shop!\n\nChoose from the options below to get started!',
            color: '#3B82F6',
            thumbnail_url: '',
            footer_text: '',
            footer_icon_url: '',
            banner_url: '',
            fields: []
        },
        private_main_menu: {
            id: 'private_main_menu',
            name: 'Private Main Menu',
            title: 'Game Shop',
            description: 'Welcome to your private shopping panel! Browse our stores below to purchase in-game currency, subscriptions, or exclusive deals.\n\n📩 **Contact <@admin> ** for assistance or custom orders.\n\n🛍️ **Select a store** to view available services.',
            color: '#3B82F6',
            thumbnail_url: '',
            footer_text: '',
            footer_icon_url: '',
            banner_url: '',
            fields: []
        },
        confirmation_page: {
            id: 'confirmation_page',
            name: 'Confirmation Page',
            title: '🛍️ Confirm Your Purchase',
            description: '**You are about to purchase** \n{product_name}.\n**Details**: \n{product_description}',
            color: '#3B82F6',
            thumbnail_url: '',
            footer_text: '',
            footer_icon_url: '',
            banner_url: '',
            fields: [
                { name: '💵 Item Price', value: '{item_price} USD', inline: true },
                { name: '⛽ Est Network Fee', value: '{network_fee}', inline: true },
                { name: '💸 Est Total Price', value: '{total_price}', inline: true },
                { name: '⛏️ Minecraft ID', value: '`{minecraft_username}`', inline: false },
                { name: '💱 Paying With', value: '**{crypto_currency}**', inline: false }
            ]
        },
        invoice_page: {
            id: 'invoice_page',
            name: 'Invoice Page',
            title: '🧾 Invoice',
            description: 'Scan the QR code or copy the details below to complete your payment. This invoice is valid for a limited time.\n\nAfter sending, please contact <@admin>.',
            color: '#10B981',
            thumbnail_url: '',
            footer_text: '',
            footer_icon_url: '',
            banner_url: '',
            fields: [
                { name: '✅ Product Name', value: '`{product_name}`', inline: true },
                { name: '✅ Product Description', value: '`{product_description}`', inline: true },
                { name: '💵 Price', value: '`{item_price}`', inline: false },
                { name: '🏠 Send To Address', value: '`{wallet_address}`', inline: false },
                { name: '💰 Exact Amount', value: '`{exact_amount} {crypto_currency}`', inline: false },
                { name: '⏰ Expires at', value: '`<t:1800seconds:F>`', inline: false }
            ]
        },
        payment_successful: {
            id: 'payment_successful',
            name: 'Payment Successful',
            title: '✅ Payment Confirmed!',
            description: '🎉 **Thank you for your purchase!** 🎉\n\nYour payment has been successfully processed and confirmed.\n\n**What happens next?**\n• Your order is being processed\n• You will receive your items shortly\n• Check your account for updates\n\nIf you have any questions, feel free to contact us.',
            color: '#22C55E',
            thumbnail_url: '',
            footer_text: '',
            footer_icon_url: '',
            banner_url: '',
            fields: []
        },
        link_minecraft: {
            id: 'link_minecraft',
            name: 'Link to Minecraft',
            title: '⛏️ Link Your Minecraft Account',
            description: '🎮 **Connect your Minecraft account to get started!**\n\nLinking your account allows us to:\n• Deliver items directly to your account\n• Track your purchase history\n• Provide faster support\n• Send automatic notifications\n\n**How to link:**\n1. Click the "Link Account" button below\n2. Enter your Minecraft username\n3. Verify your account\n4. Start shopping!\n\n**Need help?** Contact <@admin> for assistance.',
            color: '#8B5CF6',
            thumbnail_url: '',
            footer_text: '',
            footer_icon_url: '',
            banner_url: '',
            fields: []
        },
        reviews_page: {
            id: 'reviews_page',
            name: 'Reviews Page',
            title: '📊 Analytics Dashboard',
            description: '**Store performance overview**\n\nHere you can see the store rating.',
            color: '#5865F2',
            thumbnail_url: '',
            footer_text: 'Updated every 24 hours • Last update: Today',
            footer_icon_url: '',
            banner_url: '',
            fields: [
                {
                    name: '📈 Total Transactions',
                    value: '```\n2,847 completed orders\n+127 this month\n```',
                    inline: true
                },
                {
                    name: '⭐ Average Rating',
                    value: '```\n4.8/5.0 stars\nFrom 1,923 reviews\n```',
                    inline: true
                },

                {
                    name: '🏆 Best Selling Products',
                    value: '```\n1. Premium Account - 847 sales\n2. VIP Package - 623 sales\n3. Starter Bundle - 445 sales\n```',
                    inline: false
                },
                {
                    name: '📅 Recent Performance',
                    value: '```\nLast 7 days: 89 orders\nLast 30 days: 347 orders\nConversion rate: 12.3%\n```',
                    inline: false
                }
            ]
        },
        vouch_page: {
            id: 'vouch_page',
            name: 'Vouch Page',
            title: '🌟 Customer Testimonial',
            description: '> *"Amazing service! Got my items super fast and exactly as described!"*\n\n**⭐ 9.5/10** \nPurchased **Minecraft Diamonds** \nMarch 15, 2025\n\n✅ **Verified Purchase** by <@user>',
            color: '#10B981',
            thumbnail_url: '',
            footer_text: 'Verified Customer Review • Posted {timestamp}',
            footer_icon_url: '',
            banner_url: '',
            fields: []
        }
    });

    const [selectedTemplate, setSelectedTemplate] = useState<keyof BotTemplates>('public_homepage');

    // Fetch categories, products, and channels for the server
    useEffect(() => {
        let isMounted = true;
        let abortController = new AbortController();

        const fetchData = async () => {
            if (!serverId) return;

            try {
                if (!isMounted) return;
                
                setLoadingCategories(true);
                setLoadingProducts(true);
                setLoadingChannels(true);

                // Fetch data sequentially to avoid overwhelming the API
                const fetchedCategories = await apiClient.getCategories(serverId);
                if (!isMounted) return;
                setCategories(fetchedCategories || []);
                setLoadingCategories(false);

                const fetchedProducts = await apiClient.getProducts(serverId);
                if (!isMounted) return;
                setProducts(fetchedProducts || []);
                setLoadingProducts(false);

                // Fetch channels and bot config with error handling
                try {
                    const fetchedChannels = await apiClient.getServerChannels(serverId);
                    if (!isMounted) return;
                    const channelsData = (fetchedChannels as any)?.data?.channels;
                    setChannels(Array.isArray(channelsData) ? channelsData : []);
                    
                    // Show warning if there's one from the channels API
                    if ((fetchedChannels as any)?.warning) {
                        showError('Discord API Warning', (fetchedChannels as any).warning);
                    }
                } catch (channelsError) {
                    console.warn('Could not load channels - bot may not be in server:', channelsError);
                    setChannels([]);
                }

                try {
                    const botConfig = await apiClient.getBotConfig(serverId);
                    if (!isMounted) return;
                    
                    // Load existing bot configuration
                    const configData = (botConfig as any)?.data?.config || (botConfig as any)?.data || {};
                    
                    // Load vouch channel configuration
                    if (configData.vouch_channel_id) {
                        setSelectedVouchChannel(configData.vouch_channel_id);
                    }
                    
                    // Load other saved settings
                    if (configData.vouch_footer_message) {
                        setVouchFooterMessage(configData.vouch_footer_message);
                    }
                    
                    if (configData.confirmation_note) {
                        setConfirmationNote(configData.confirmation_note);
                    }

                    // Load saved product display settings
                    if (configData.productDisplaySettings || configData.product_display_settings) {
                        const savedPds = configData.productDisplaySettings ?? configData.product_display_settings;
                        setProductDisplaySettings((prev) => ({
                            showProducts: typeof savedPds.showProducts === 'boolean' ? savedPds.showProducts : prev.showProducts,
                            displayMode: savedPds.displayMode === 'vertical' ? 'vertical' : 'horizontal'
                        }));
                    }
                    
                    // Load saved templates
                    if (configData.templates) {
                        setTemplates(prevTemplates => ({
                            ...prevTemplates,
                            ...configData.templates
                        }));
                    }
                } catch (configError) {
                    console.warn('Could not load bot config:', configError);
                }

            } catch (error: any) {
                if (!isMounted) return;
                
                console.error('Failed to fetch data:', error);

                // Handle authentication errors specifically
                if (error.code === 'AUTHENTICATION_ERROR') {
                    showError('Authentication Required', 'Please sign in again to access this data.');
                } else if (error.status === 429) {
                    showError('Rate Limited', 'Too many requests. Please wait a moment and try again.');
                } else {
                    showError('Failed to load data', 'Could not load categories and products for this server.');
                }
            } finally {
                if (isMounted) {
                    setLoadingCategories(false);
                    setLoadingProducts(false);
                    setLoadingChannels(false);
                }
            }
        };

        // Debounce the fetch to prevent rapid successive calls
        const timeoutId = setTimeout(fetchData, 100);

        return () => {
            isMounted = false;
            abortController.abort();
            clearTimeout(timeoutId);
        };
    }, [serverId, showError]);

    const handleSave = async () => {
        try {
            setSaving(true);
            
            // Prepare bot configuration update
            const botConfigUpdate = {
                vouch_channel_id: selectedVouchChannel || null,
                // Add other template-related configs here if needed
                templates: templates,
                vouch_footer_message: vouchFooterMessage,
                confirmation_note: confirmationNote,
                // Persist product display settings for Private Main Menu
                product_display_settings: productDisplaySettings
            };

            // Save to backend
            await apiClient.updateBotConfig(serverId, botConfigUpdate);

            success('Settings Saved', 'Bot settings and templates have been updated successfully.');
        } catch (error: any) {
            console.error('Failed to save settings:', error);
            
            if (error.code === 'AUTHENTICATION_ERROR') {
                showError('Authentication Required', 'Please sign in again to save settings.');
            } else if (error.status === 403) {
                showError('Permission Denied', 'You do not have permission to modify this server.');
            } else {
                showError('Save Failed', 'Failed to save settings. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleTemplateChange = (templateId: keyof BotTemplates, field: keyof EmbedTemplate, value: any) => {
        setTemplates(prev => ({
            ...prev,
            [templateId]: {
                ...prev[templateId],
                [field]: value
            }
        }));
    };

    const handleFieldChange = (templateId: keyof BotTemplates, fieldIndex: number, fieldKey: string, value: any) => {
        setTemplates(prev => ({
            ...prev,
            [templateId]: {
                ...prev[templateId],
                fields: prev[templateId].fields.map((field, index) =>
                    index === fieldIndex ? { ...field, [fieldKey]: value } : field
                )
            }
        }));
    };



    const addField = (templateId: keyof BotTemplates) => {
        setTemplates(prev => ({
            ...prev,
            [templateId]: {
                ...prev[templateId],
                fields: [...prev[templateId].fields, { name: 'New Field', value: 'Field value', inline: false }]
            }
        }));
    };

    const removeField = (templateId: keyof BotTemplates, fieldIndex: number) => {
        setTemplates(prev => ({
            ...prev,
            [templateId]: {
                ...prev[templateId],
                fields: prev[templateId].fields.filter((_, index) => index !== fieldIndex)
            }
        }));
    };



    return (
        <>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Bot Message Templates</h1>
                    <p className="text-gray-600">Customize your bot's embed messages for different pages</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Template Editor */}
                    <div className="space-y-6">
                        {/* Template Selector */}
                        <Card>
                            <CardHeader>
                                <h3 className="text-lg font-semibold">Select Template</h3>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(templates).map(([key, template]) => (
                                        <button
                                            key={key}
                                            onClick={() => setSelectedTemplate(key as keyof BotTemplates)}
                                            className={`p-3 text-sm rounded-lg border transition-colors ${selectedTemplate === key
                                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            {template.name}
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Template Editor */}
                        <Card>
                            <CardHeader>
                                <h4 className="text-lg font-semibold">
                                    Edit {templates[selectedTemplate].name}
                                </h4>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Basic Template Settings */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Title
                                        </label>
                                        <input
                                            type="text"
                                            value={templates[selectedTemplate].title}
                                            onChange={(e) => handleTemplateChange(selectedTemplate, 'title', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Color
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={templates[selectedTemplate].color}
                                                onChange={(e) => handleTemplateChange(selectedTemplate, 'color', e.target.value)}
                                                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={templates[selectedTemplate].color}
                                                onChange={(e) => handleTemplateChange(selectedTemplate, 'color', e.target.value)}
                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    {selectedTemplate === 'confirmation_page' ? (
                                        <div className="space-y-3">
                                            {/* Editable note part */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Note Section
                                                </label>
                                                <textarea
                                                    value={confirmationNote}
                                                    onChange={(e) => setConfirmationNote(e.target.value)}
                                                    rows={2}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="Enter your custom note..."
                                                />
                                            </div>
                                        </div>
                                    ) : selectedTemplate === 'vouch_page' ? (
                                        <div className="space-y-3">
                                            {/* Fixed description - not editable */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Vouch Template (Fixed Format)
                                                </label>
                                                <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-sm">
                                                    {templates[selectedTemplate].description}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    This format is fixed to ensure consistent vouch display. Customer data will automatically fill in.
                                                </p>
                                            </div>
                                            {/* Editable footer message */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Custom Footer Message
                                                </label>
                                                <textarea
                                                    value={vouchFooterMessage}
                                                    onChange={(e) => setVouchFooterMessage(e.target.value)}
                                                    rows={2}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="Enter a custom message for vouch footer..."
                                                />
                                                <p className="text-xs text-gray-500 mt-1">
                                                    This message will appear in the footer of each vouch post.
                                                </p>
                                            </div>
                                            
                                            {/* Channel selector for vouches */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Vouch Channel
                                                </label>
                                                <select
                                                    value={selectedVouchChannel}
                                                    onChange={(e) => setSelectedVouchChannel(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    disabled={loadingChannels}
                                                >
                                                    <option value="">Select a channel for vouches</option>
                                                    {channels.map((channel) => (
                                                        <option key={channel.id} value={channel.id}>
                                                            #{channel.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="flex items-center justify-between mt-1">
                                                    <p className="text-xs text-gray-500">
                                                        {loadingChannels 
                                                            ? 'Loading channels...' 
                                                            : channels.length === 0 
                                                            ? 'No channels available. Make sure the bot is in your server with proper permissions.'
                                                            : 'Select the channel where customer vouches will be posted.'
                                                        }
                                                    </p>
                                                    {channels.length === 0 && !loadingChannels && (
                                                        <button
                                                            onClick={async () => {
                                try {
                                                    const testResult = await apiClient.testDiscordConnection(serverId);
                                                    if ((testResult as any).success) {
                                                        success('Discord Test', 'Bot connection is working! Try refreshing the page.');
                                                    } else {
                                                        showError('Discord Test Failed', (testResult as any).error || 'Unknown error');
                                                    }
                                                } catch (error: any) {
                                                    showError('Test Failed', error.message || 'Could not test Discord connection');
                                                }
                                                            }}
                                                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                                                        >
                                                            Test Connection
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <textarea
                                                value={templates[selectedTemplate].description}
                                                onChange={(e) => handleTemplateChange(selectedTemplate, 'description', e.target.value)}
                                                rows={4}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Enter the embed description..."
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Use variables like {'{service_name}'}, {'{total_price}'}, etc. for dynamic content
                                            </p>
                                        </>
                                    )}
                                </div>

                                {/* URLs */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Thumbnail URL
                                        </label>
                                        <input
                                            type="url"
                                            value={templates[selectedTemplate].thumbnail_url}
                                            onChange={(e) => handleTemplateChange(selectedTemplate, 'thumbnail_url', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="https://example.com/image.png"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Footer Icon URL
                                        </label>
                                        <input
                                            type="url"
                                            value={templates[selectedTemplate].footer_icon_url}
                                            onChange={(e) => handleTemplateChange(selectedTemplate, 'footer_icon_url', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="https://example.com/icon.png"
                                        />
                                    </div>
                                </div>

                                {/* Banner URL */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Banner Image URL
                                    </label>
                                    <input
                                        type="url"
                                        value={templates[selectedTemplate].banner_url}
                                        onChange={(e) => handleTemplateChange(selectedTemplate, 'banner_url', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="https://example.com/banner.png"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Large banner image displayed at the top of the embed</p>
                                </div>

                                {/* Footer Text */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Footer Text
                                    </label>
                                    {selectedTemplate === 'vouch_page' ? (
                                        <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-sm">
                                            {vouchFooterMessage} • Posted {'{timestamp}'}
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={templates[selectedTemplate].footer_text}
                                            onChange={(e) => handleTemplateChange(selectedTemplate, 'footer_text', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Footer text"
                                        />
                                    )}
                                </div>

                                {/* Product Display Settings - Only for Private Main Menu */}
                                {selectedTemplate === 'private_main_menu' && (
                                    <div className="border-t border-gray-200 pt-6">
                                        <h5 className="text-md font-medium text-gray-900 mb-4">Product Display Settings</h5>

                                        <div className="space-y-4">
                                            {/* Show Products Toggle */}
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    id="showProducts"
                                                    checked={productDisplaySettings.showProducts}
                                                    onChange={(e) => setProductDisplaySettings(prev => ({
                                                        ...prev,
                                                        showProducts: e.target.checked
                                                    }))}
                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                />
                                                <label htmlFor="showProducts" className="text-sm font-medium text-gray-700">
                                                    Display products in category embeds
                                                </label>
                                            </div>

                                            {productDisplaySettings.showProducts && (
                                                <>
                                                    {/* Display Mode */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Product Layout
                                                        </label>
                                                        <div className="flex gap-4">
                                                            <label className="flex items-center">
                                                                <input
                                                                    type="radio"
                                                                    name="displayMode"
                                                                    value="horizontal"
                                                                    checked={productDisplaySettings.displayMode === 'horizontal'}
                                                                    onChange={(e) => setProductDisplaySettings(prev => ({
                                                                        ...prev,
                                                                        displayMode: e.target.value as 'horizontal' | 'vertical'
                                                                    }))}
                                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                                />
                                                                <span className="ml-2 text-sm text-gray-700">Horizontal</span>
                                                            </label>
                                                            <label className="flex items-center">
                                                                <input
                                                                    type="radio"
                                                                    name="displayMode"
                                                                    value="vertical"
                                                                    checked={productDisplaySettings.displayMode === 'vertical'}
                                                                    onChange={(e) => setProductDisplaySettings(prev => ({
                                                                        ...prev,
                                                                        displayMode: e.target.value as 'horizontal' | 'vertical'
                                                                    }))}
                                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                                />
                                                                <span className="ml-2 text-sm text-gray-700">Vertical</span>
                                                            </label>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            Horizontal shows products in a row, vertical shows them stacked
                                                        </p>
                                                    </div>


                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}




                            </CardContent>
                        </Card>
                    </div>

                    {/* Template Preview */}
                    <div className="space-y-6">
                        <TemplatePreview
                            selectedTemplate={selectedTemplate}
                            templates={templates}
                            categories={categories}
                            products={products}
                            loadingCategories={loadingCategories}
                            loadingProducts={loadingProducts}
                            productDisplaySettings={productDisplaySettings}
                            previewSelectedCategory={previewSelectedCategory}
                            setPreviewSelectedCategory={setPreviewSelectedCategory}
                            previewSelectedProduct={previewSelectedProduct}
                            setPreviewSelectedProduct={setPreviewSelectedProduct}
                            previewSelectedQuantity={previewSelectedQuantity}
                            setPreviewSelectedQuantity={setPreviewSelectedQuantity}
                            previewSelectedPaymentMethod={previewSelectedPaymentMethod}
                            setPreviewSelectedPaymentMethod={setPreviewSelectedPaymentMethod}
                            confirmationCrypto={confirmationCrypto}
                            setConfirmationCrypto={setConfirmationCrypto}
                            confirmationNetwork={confirmationNetwork}
                            setConfirmationNetwork={setConfirmationNetwork}
                        />
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end mt-8">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2"
                    >
                        <Save className="h-4 w-4" />
                        {saving ? 'Saving...' : 'Save Templates'}
                    </Button>
                </div>
            </div>

            {/* Toast Container */}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </>
    );
}