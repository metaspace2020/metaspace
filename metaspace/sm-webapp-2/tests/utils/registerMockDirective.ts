import { App, Directive } from 'vue';

export default (app: App, name: string) => {
  const mockName = `mock-v-${name}`;

  app.config.isCustomElement = tag => tag === mockName;

  const mockDirective: Directive = {
    mounted(el, { value, arg, modifiers }) {
      const modifierString = Object.keys(modifiers).join('.');
      const directiveSuffix = (arg ? `:${arg}` : '') + (modifierString ? `.${modifierString}` : '');

      el.setAttribute(mockName + directiveSuffix, value as any);
    },
  };

  app.directive(name, mockDirective);
};
