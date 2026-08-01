import { ContentSection } from '../components/content-section'
import { NotificationsForm } from './notifications-form'

export function SettingsNotifications() {
  return (
    <ContentSection title='通知' desc='配置你希望接收的通知类型。'>
      <NotificationsForm />
    </ContentSection>
  )
}
