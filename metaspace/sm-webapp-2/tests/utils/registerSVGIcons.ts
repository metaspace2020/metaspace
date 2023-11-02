import { defineComponent, h, App } from 'vue';
import fs from 'fs';
import path from 'path';

const relativePath = '../../src/assets/inline/refactoring-ui';
const files = fs.readdirSync(path.resolve(__dirname, relativePath));

export default (app: any): void => {
  for (const file of files) {
    const name = `${file.split('.')[0]}-icon`;
    const mockName = `svg-${name}`;

    app.config.isCustomElement = tag => tag === mockName;

    app.component(name, defineComponent({
      name: name,
      render() {
        return h(mockName);
      }
    }));
  }
};
