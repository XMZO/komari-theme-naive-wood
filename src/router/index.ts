import { createRouter, createWebHistory } from 'vue-router'
import { recordPageView } from '@/utils/visitorAudit'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/instance/:id',
      name: 'instance-detail',
      component: () => import('@/views/InstanceDetail.vue'),
    },
  ],
})

router.beforeEach(() => {
  window.$loadingBar.start()
})

router.afterEach((to, _from, failure) => {
  window.$loadingBar.finish()
  if (!failure)
    recordPageView(to)
})

export default router
