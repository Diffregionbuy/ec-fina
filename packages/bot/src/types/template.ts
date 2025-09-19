export interface TemplateVariable {
    name: string;
    value: any;
    type: 'string' | 'number' | 'boolean' | 'object';
}

export interface EmbedTemplate {
    title?: string;
    description?: string;
    color?: number;
    thumbnail?: {
        url: string;
    };
    image?: {
        url: string;
    };
    fields?: Array<{
        name: string;
        value: string;
        inline?: boolean;
    }>;
    footer?: {
        text: string;
        icon_url?: string;
    };
    timestamp?: boolean;
}

export interface ButtonTemplate {
    customId: string;
    label: string;
    style: number; // 1-5 for different button styles
    emoji?: string;
    disabled?: boolean;
}

export interface SelectMenuTemplate {
    customId: string;
    placeholder: string;
    minValues?: number;
    maxValues?: number;
    options: Array<{
        label: string;
        value: string;
        description?: string;
        emoji?: string;
        default?: boolean;
    }>;
}

export interface TemplateComponent {
    type: 'embed' | 'button' | 'select' | 'modal';
    data: EmbedTemplate | ButtonTemplate | SelectMenuTemplate | any;
}

export interface ProcessedTemplate {
    embed?: any;
    embeds?: EmbedTemplate[];
    components?: any[];
    content?: string;
}