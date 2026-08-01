import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const __section__FormSchema = z.object({
  name: z
    .string()
    .min(1, '请输入名称。')
    .min(2, '名称至少 2 个字符。')
    .max(40, '名称不能超过 40 个字符。'),
  note: z.string().max(160, '备注不能超过 160 个字符。').optional(),
})

type __Section__FormValues = z.infer<typeof __section__FormSchema>

const defaultValues: Partial<__Section__FormValues> = {
  name: '',
  note: '',
}

export function __Section__Form() {
  const form = useForm<__Section__FormValues>({
    resolver: zodResolver(__section__FormSchema),
    defaultValues,
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => showSubmittedData(data))}
        className='space-y-6'
      >
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>名称</FormLabel>
              <FormControl>
                <Input placeholder='请输入名称' {...field} />
              </FormControl>
              <FormDescription>用于设置页展示的名称。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='note'
          render={({ field }) => (
            <FormItem>
              <FormLabel>备注</FormLabel>
              <FormControl>
                <Input placeholder='可选备注' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit'>保存</Button>
      </form>
    </Form>
  )
}
