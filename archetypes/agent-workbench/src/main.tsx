import { mountWorkbench } from './app/bootstrap/mount'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Missing #root element')
}

mountWorkbench(rootElement)
