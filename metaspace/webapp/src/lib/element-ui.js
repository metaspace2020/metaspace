// ElementUI is one of this project's biggest dependencies and doesn't support tree shaking, causing a lot of wasted
// space in the compiled JS output.
// A misconfiguration in their build pipeline (https://github.com/ElemeFE/element/issues/11528) causes
// multiple copies of some components to be included, and the suggested alternative to tree-shaking
// (https://github.com/ElementUI/babel-plugin-component) doesn't work with directives, mixins,
// or with the precompiled themed CSS bundle.
//
// Additionally, we want to reduce our dependence on ElementUI over time for a number of reasons:
// * It's a monolithic dependency with a high maintenance cost. There have been several instances where updating to
//   fix a bug in one component has introduced new bugs in other components, or minor updates have made significant
//   changes to global styling.
// * Many components would be better handled purely through CSS (Row, Col, Divider, etc.)
// * It's not a good fit for our look & feel. Many components require additional styling to look acceptable in situ.
//
// This file attempts to fix the the tree-shaking & duplication issues by directly importing only the components needed
// for this project. Additionally, by only importing components that are actually used, this prevents the accidental '
// introduction of new dependencies on ElementUI.

import Pagination from 'element-ui/lib/pagination'
import Dialog from 'element-ui/lib/dialog'
import Autocomplete from 'element-ui/lib/autocomplete'
import Dropdown from 'element-ui/lib/dropdown'
import DropdownMenu from 'element-ui/lib/dropdown-menu'
import DropdownItem from 'element-ui/lib/dropdown-item'
// import Menu from 'element-ui/lib/menu'
// import Submenu from 'element-ui/lib/submenu'
// import MenuItem from 'element-ui/lib/menu-item'
// import MenuItemGroup from 'element-ui/lib/menu-item-group'
import Input from 'element-ui/lib/input'
import InputNumber from 'element-ui/lib/input-number'
import Radio from 'element-ui/lib/radio'
import RadioGroup from 'element-ui/lib/radio-group'
import RadioButton from 'element-ui/lib/radio-button'
import Checkbox from 'element-ui/lib/checkbox'
import CheckboxButton from 'element-ui/lib/checkbox-button'
import CheckboxGroup from 'element-ui/lib/checkbox-group'
import Switch from 'element-ui/lib/switch'
import Select from 'element-ui/lib/select'
import Option from 'element-ui/lib/option'
import OptionGroup from 'element-ui/lib/option-group'
import Button from 'element-ui/lib/button'
import ButtonGroup from 'element-ui/lib/button-group'
import Table from 'element-ui/lib/table'
import TableColumn from 'element-ui/lib/table-column'
// import DatePicker from 'element-ui/lib/date-picker'
// import TimeSelect from 'element-ui/lib/time-select'
// import TimePicker from 'element-ui/lib/time-picker'
import Popover from 'element-ui/lib/popover'
import Tooltip from 'element-ui/lib/tooltip'
import MessageBox from 'element-ui/lib/message-box'
// import Breadcrumb from 'element-ui/lib/breadcrumb'
// import BreadcrumbItem from 'element-ui/lib/breadcrumb-item'
import Form from 'element-ui/lib/form'
import FormItem from 'element-ui/lib/form-item'
import Tabs from 'element-ui/lib/tabs'
import TabPane from 'element-ui/lib/tab-pane'
// import Tag from 'element-ui/lib/tag'
import Tree from 'element-ui/lib/tree'
import Alert from 'element-ui/lib/alert'
import Notification from 'element-ui/lib/notification'
import Slider from 'element-ui/lib/slider'
import Loading from 'element-ui/lib/loading'
import Icon from 'element-ui/lib/icon'
import Row from 'element-ui/lib/row'
import Col from 'element-ui/lib/col'
// import Upload from 'element-ui/lib/upload'
import Progress from 'element-ui/lib/progress'
// import Spinner from 'element-ui/lib/spinner'
import Message from 'element-ui/lib/message'
import Badge from 'element-ui/lib/badge'
// import Card from 'element-ui/lib/card'
// import Rate from 'element-ui/lib/rate'
// import Steps from 'element-ui/lib/steps'
// import Step from 'element-ui/lib/step'
import Carousel from 'element-ui/lib/carousel'
// import Scrollbar from 'element-ui/lib/scrollbar'
import CarouselItem from 'element-ui/lib/carousel-item'
import Collapse from 'element-ui/lib/collapse'
import CollapseItem from 'element-ui/lib/collapse-item'
// import Cascader from 'element-ui/lib/cascader'
// import ColorPicker from 'element-ui/lib/color-picker'
// import Transfer from 'element-ui/lib/transfer'
// import Container from 'element-ui/lib/container'
// import Header from 'element-ui/lib/header'
// import Aside from 'element-ui/lib/aside'
// import Main from 'element-ui/lib/main'
// import Footer from 'element-ui/lib/footer'
// import Timeline from 'element-ui/lib/timeline'
// import TimelineItem from 'element-ui/lib/timeline-item'
// import Link from 'element-ui/lib/link'
import Divider from 'element-ui/lib/divider'
// import Image from 'element-ui/lib/image'
// import Calendar from 'element-ui/lib/calendar'
// import Backtop from 'element-ui/lib/backtop'
// import InfiniteScroll from 'element-ui/lib/infinite-scroll'
// import PageHeader from 'element-ui/lib/page-header'
// import CascaderPanel from 'element-ui/lib/cascader-panel'
// import Avatar from 'element-ui/lib/avatar'
// import Drawer from 'element-ui/lib/drawer'
// import Popconfirm from 'element-ui/lib/popconfirm'
import locale from 'element-ui/lib/locale'
import CollapseTransition from 'element-ui/lib/transitions/collapse-transition'

const components = {
  Pagination,
  Dialog,
  Autocomplete,
  Dropdown,
  DropdownMenu,
  DropdownItem,
  // Menu,
  // Submenu,
  // MenuItem,
  // MenuItemGroup,
  Input,
  InputNumber,
  Radio,
  RadioGroup,
  RadioButton,
  Checkbox,
  CheckboxButton,
  CheckboxGroup,
  Switch,
  Select,
  Option,
  OptionGroup,
  Button,
  ButtonGroup,
  Table,
  TableColumn,
  // DatePicker,
  // TimeSelect,
  // TimePicker,
  Popover,
  Tooltip,
  // Breadcrumb,
  // BreadcrumbItem,
  Form,
  FormItem,
  Tabs,
  TabPane,
  // Tag,
  Tree,
  Alert,
  Slider,
  Icon,
  Row,
  Col,
  // Upload,
  Progress,
  // Spinner,
  Badge,
  // Card,
  // Rate,
  // Steps,
  // Step,
  Carousel,
  // Scrollbar,
  CarouselItem,
  Collapse,
  CollapseItem,
  // Cascader,
  // ColorPicker,
  // Transfer,
  // Container,
  // Header,
  // Aside,
  // Main,
  // Footer,
  // Timeline,
  // TimelineItem,
  // Link,
  Divider,
  // Image,
  // Calendar,
  // Backtop,
  // PageHeader,
  // CascaderPanel,
  // Avatar,
  // Drawer,
  // Popconfirm,
  CollapseTransition,
}

export {
  Pagination,
  Dialog,
  Autocomplete,
  Dropdown,
  DropdownMenu,
  DropdownItem,
  // Menu,
  // Submenu,
  // MenuItem,
  // MenuItemGroup,
  Input,
  InputNumber,
  Radio,
  RadioGroup,
  RadioButton,
  Checkbox,
  CheckboxButton,
  CheckboxGroup,
  Switch,
  Select,
  Option,
  OptionGroup,
  Button,
  ButtonGroup,
  Table,
  TableColumn,
  // DatePicker,
  // TimeSelect,
  // TimePicker,
  Popover,
  Tooltip,
  // Breadcrumb,
  // BreadcrumbItem,
  Form,
  FormItem,
  Tabs,
  TabPane,
  // Tag,
  Tree,
  Alert,
  Slider,
  Icon,
  Row,
  Col,
  // Upload,
  Progress,
  // Spinner,
  Badge,
  // Card,
  // Rate,
  // Steps,
  // Step,
  Carousel,
  // Scrollbar,
  CarouselItem,
  Collapse,
  CollapseItem,
  // Cascader,
  // ColorPicker,
  // Transfer,
  // Container,
  // Header,
  // Aside,
  // Main,
  // Footer,
  // Timeline,
  // TimelineItem,
  // Link,
  Divider,
  // Image,
  // Calendar,
  // Backtop,
  // PageHeader,
  // CascaderPanel,
  // Avatar,
  // Drawer,
  // Popconfirm,
  CollapseTransition,

  MessageBox,
  Message,
}


const install = function(Vue, opts = {}) {
  locale.use(opts.locale)
  locale.i18n(opts.i18n)

  Object.values(components).forEach(component => {
    Vue.component(component.name, component)
  })

  // Vue.use(InfiniteScroll)
  Vue.use(Loading.directive)

  // Vue.prototype.$loading = Loading.service
  Vue.prototype.$msgbox = MessageBox
  Vue.prototype.$alert = MessageBox.alert
  Vue.prototype.$confirm = MessageBox.confirm
  Vue.prototype.$prompt = MessageBox.prompt
  Vue.prototype.$notify = Notification
  Vue.prototype.$message = Message
}

export default {install}
