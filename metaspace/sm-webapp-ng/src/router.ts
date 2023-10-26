import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import AboutView from './views/AboutView.vue'
import store from './store'
// ... other imports ...

const routes = [
  {
    path: '/',
    component: HomeView
  },
  {
    path: '/user/:id',
    component: AboutView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.afterEach((to) => {
  console.log('to', to)
  // store.commit('updateFilterOnNavigate', to)
})

export default router
