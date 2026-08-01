import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { __Domain__PrimaryButtons } from './components/__domain__-primary-buttons'
import { __Domain__Table } from './components/__domain__-table'
import { __domain__Items } from './data/data'

export function __Domain__() {
  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>__DOMAIN_TITLE__</h2>
            <p className='text-muted-foreground'>__DOMAIN_DESC__</p>
          </div>
          <__Domain__PrimaryButtons />
        </div>
        <__Domain__Table data={__domain__Items} />
      </Main>
    </>
  )
}
