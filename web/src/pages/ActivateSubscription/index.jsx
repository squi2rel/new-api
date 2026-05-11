/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showInfo,
  showSuccess,
  timestamp2string,
} from '../../helpers';
import { UserContext } from '../../context/User';
import {
  Banner,
  Button,
  Card,
  Form,
  Modal,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { BadgeCheck, KeyRound, RefreshCw } from 'lucide-react';

const { Text, Title } = Typography;

const ActivateSubscription = () => {
  const { t } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);
  const [activationCode, setActivationCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [allSubscriptions, setAllSubscriptions] = useState([]);

  const loadUserSelf = useCallback(async () => {
    const res = await API.get('/api/user/self');
    if (res.data?.success) {
      userDispatch({ type: 'login', payload: res.data.data });
    }
  }, [userDispatch]);

  const loadSubscriptionSelf = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/self');
      if (res.data?.success) {
        setActiveSubscriptions(res.data.data?.subscriptions || []);
        setAllSubscriptions(res.data.data?.all_subscriptions || []);
      } else {
        setActiveSubscriptions([]);
        setAllSubscriptions([]);
      }
    } catch (error) {
      setActiveSubscriptions([]);
      setAllSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscriptionSelf().catch(() => {});
  }, [loadSubscriptionSelf]);

  const activeCount = activeSubscriptions.length;

  const latestActiveSubscription = useMemo(() => {
    if (activeSubscriptions.length === 0) {
      return null;
    }
    return activeSubscriptions[0]?.subscription || null;
  }, [activeSubscriptions]);

  const runActivation = useCallback(async () => {
    if (!activationCode.trim()) {
      showInfo(t('请输入激活码！'));
      return;
    }

    setActivating(true);
    try {
      const res = await API.post('/api/subscription/activate', {
        key: activationCode.trim(),
      });
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }

      await Promise.allSettled([loadUserSelf(), loadSubscriptionSelf()]);

      showSuccess(t('激活成功！'));
      Modal.success({
        title: t('激活成功！'),
        centered: true,
        content: (
          <Space vertical align='start'>
            <Text>
              {t('已激活订阅套餐')}：
              <Text strong>{data?.plan_title || `#${data?.plan_id}`}</Text>
            </Text>
            {data?.subscription?.end_time ? (
              <Text>
                {t('有效期至')}：
                <Text strong>{timestamp2string(data.subscription.end_time)}</Text>
              </Text>
            ) : null}
            {Number(data?.replaced_subscriptions_count) > 0 ? (
              <Text>
                {t('已替换 {{count}} 个生效订阅', {
                  count: data.replaced_subscriptions_count,
                })}
              </Text>
            ) : null}
          </Space>
        ),
      });
      setActivationCode('');
    } catch (error) {
      showError(
        error?.response?.data?.message || error?.message || t('请求失败'),
      );
    } finally {
      setActivating(false);
    }
  }, [activationCode, loadSubscriptionSelf, loadUserSelf, t]);

  const handleActivate = useCallback(() => {
    if (!activationCode.trim()) {
      showInfo(t('请输入激活码！'));
      return;
    }

    if (activeCount > 0) {
      Modal.confirm({
        title: t('确认替换当前订阅？'),
        centered: true,
        content: t(
          '当前存在 {{count}} 个生效订阅。继续激活后，这些订阅会被立即作废，且不会补偿剩余时长或剩余额度。',
          { count: activeCount },
        ),
        okText: t('继续激活'),
        cancelText: t('取消'),
        onOk: runActivation,
      });
      return;
    }

    runActivation();
  }, [activationCode, activeCount, runActivation, t]);

  return (
    <div className='mt-[60px] px-2'>
      <div className='mx-auto max-w-3xl py-4'>
        <Card
          className='!rounded-2xl shadow-sm'
          title={
            <Space>
              <KeyRound size={18} />
              <Text strong>{t('激活订阅')}</Text>
            </Space>
          }
          headerExtraContent={
            <Button
              theme='borderless'
              icon={<RefreshCw size={15} />}
              loading={loading}
              onClick={() => loadSubscriptionSelf()}
            >
              {t('刷新')}
            </Button>
          }
        >
          <Space vertical align='start' style={{ width: '100%' }} spacing='large'>
            <div>
              <Title heading={5} className='!mb-1'>
                {t('使用激活码开通或替换订阅')}
              </Title>
              <Text type='tertiary'>
                {t('激活成功后会立即创建新订阅；若当前有生效订阅，将直接作废后替换。')}
              </Text>
            </div>

            {activeCount > 0 ? (
              <Banner
                type='warning'
                description={t(
                  '继续激活将替换全部生效订阅，且不会补偿剩余时长或剩余额度。',
                )}
                className='!rounded-xl w-full'
                closeIcon={null}
              />
            ) : (
              <Banner
                type='info'
                description={t('激活后会直接开通新的订阅套餐。')}
                className='!rounded-xl w-full'
                closeIcon={null}
              />
            )}

            <Card className='!rounded-xl w-full' bordered={false}>
              <Space vertical align='start' style={{ width: '100%' }} spacing='medium'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Tag color={activeCount > 0 ? 'orange' : 'green'} shape='circle'>
                    {activeCount > 0
                      ? t('{{count}} 个生效订阅', { count: activeCount })
                      : t('无生效订阅')}
                  </Tag>
                  {latestActiveSubscription?.end_time ? (
                    <Text type='tertiary'>
                      {t('最近到期')}：
                      {timestamp2string(latestActiveSubscription.end_time)}
                    </Text>
                  ) : null}
                </div>

                <Form initValues={{ activationCode }}>
                  <Form.Input
                    field='activationCode'
                    noLabel
                    prefix={<BadgeCheck size={16} />}
                    placeholder={t('请输入激活码')}
                    value={activationCode}
                    onChange={(value) => setActivationCode(value)}
                    suffix={
                      <Button
                        type='primary'
                        theme='solid'
                        loading={activating}
                        onClick={handleActivate}
                      >
                        {t('立即激活')}
                      </Button>
                    }
                    showClear
                    style={{ width: '100%' }}
                  />
                </Form>
              </Space>
            </Card>

            {allSubscriptions.length > 0 ? (
              <Card className='!rounded-xl w-full' bordered={false}>
                <Space vertical align='start' style={{ width: '100%' }} spacing='small'>
                  <Text strong>{t('订阅状态')}</Text>
                  {allSubscriptions.slice(0, 5).map((item) => {
                    const subscription = item?.subscription;
                    if (!subscription) {
                      return null;
                    }

                    const isActive =
                      subscription.status === 'active' &&
                      subscription.end_time > Math.floor(Date.now() / 1000);

                    return (
                      <div
                        key={subscription.id}
                        className='flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2'
                        style={{ borderColor: 'var(--semi-color-border)' }}
                      >
                        <Space>
                          <Tag color={isActive ? 'green' : 'grey'} shape='circle'>
                            {isActive ? t('生效中') : t('已失效')}
                          </Tag>
                          <Text>#{subscription.plan_id}</Text>
                        </Space>
                        <Text type='tertiary'>
                          {timestamp2string(subscription.start_time)} -{' '}
                          {timestamp2string(subscription.end_time)}
                        </Text>
                      </div>
                    );
                  })}
                </Space>
              </Card>
            ) : null}
          </Space>
        </Card>
      </div>
    </div>
  );
};

export default ActivateSubscription;
