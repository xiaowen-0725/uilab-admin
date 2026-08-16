/**
 * Standalone entry for the Board prototype (#121): `pnpm dev:workbench`, then
 * open http://localhost:5174/prototype/board.html
 *
 * Deliberately outside the Shell. Board's real navigation extends the Shell's
 * `activeDestination` (#118), which is implementation work; this entry exists so
 * the grid, drag, chrome and thumbnails can be judged by hand first.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BoardPrototype } from '@/modules/board'
import '@/styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')

createRoot(container).render(
  <StrictMode>
    <div className='h-screen w-screen overflow-hidden bg-background text-foreground'>
      <BoardPrototype />
    </div>
  </StrictMode>,
)
