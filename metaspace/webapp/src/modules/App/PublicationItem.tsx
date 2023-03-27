import { defineComponent } from '@vue/composition-api'

interface Props {
  publisher: string
  title: string
  authors: string
  year: string
  link: string
}

const PublicationItem = defineComponent<Props>({
  name: 'PublicationItem',
  props: {
    publisher: {
      type: String,
    },
    title: {
      type: String,
    },
    authors: {
      type: String,
    },
    year: {
      type: String,
    },
    link: {
      type: String,
    },
  },
  setup(props, ctx) {
    return () => {
      return (
        <li>
          <h3 class="text-blue-800 text-base font-medium m-0">
            { props.title }
          </h3>
          <p>
            { props.authors }
          </p>
          <p class="text-sm font-medium">
            <span class="text-green-800">{ props.publisher }</span>, <time>{ props.year }</time>
          </p>
          <p class="text-sm truncate text-primary">
            <a href={props.link}>{ props.link }</a>
          </p>
        </li>
      )
    }
  },
})

export default PublicationItem
