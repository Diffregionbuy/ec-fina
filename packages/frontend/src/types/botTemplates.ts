export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  color: string;
  thumbnail_url: string;
  banner_url: string;
  footer_text: string;
  footer_icon_url: string;
  fields: EmbedField[];
}

export interface BotTemplates {
  public_homepage: EmbedTemplate;
  private_main_menu: EmbedTemplate;
  invoice_page: EmbedTemplate;
  confirmation_page: EmbedTemplate;
  link_minecraft: EmbedTemplate;
  payment_successful: EmbedTemplate;
  reviews_page: EmbedTemplate;
  vouch_page: EmbedTemplate;
}

export interface ProductDisplaySettings {
  showProducts: boolean;
  displayMode: 'horizontal' | 'vertical';
}