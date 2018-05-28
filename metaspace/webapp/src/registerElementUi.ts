import Vue from 'vue';
import lang from 'element-ui/lib/locale/lang/en'
import locale from 'element-ui/lib/locale'
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Col,
  Collapse,
  CollapseItem,
  Dialog,
  Form,
  FormItem,
  Input,
  InputNumber,
  Option,
  Pagination,
  Popover,
  RadioButton,
  RadioGroup,
  Row,
  Select,
  Slider,
  Table,
  TableColumn,
} from 'element-ui'

locale.use(lang);

[
  Button,
  Checkbox,
  CheckboxGroup,
  Col,
  Collapse,
  CollapseItem,
  Dialog,
  Form,
  FormItem,
  Input,
  InputNumber,
  Option,
  Pagination,
  Popover,
  RadioButton,
  RadioGroup,
  Row,
  Select,
  Slider,
  Table,
  TableColumn,
].forEach(c => Vue.use(c));
