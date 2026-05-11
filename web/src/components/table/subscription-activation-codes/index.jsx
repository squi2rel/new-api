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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  copy,
  downloadTextAsFile,
  showError,
  showSuccess,
  timestamp2string,
} from '../../../helpers';
import { ITEMS_PER_PAGE } from '../../../constants';
import { REDEMPTION_STATUS, REDEMPTION_STATUS_MAP } from '../../../constants/redemption.constants';
import { useTableCompactMode } from '../../../hooks/common/useTableCompactMode';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';
import CardPro from '../../common/ui/CardPro';
import CardTable from '../../common/ui/CardTable';
import CompactModeToggle from '../../common/ui/CompactModeToggle';
import {
  Avatar,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Modal,
  Popover,
  Row,
  Select,
  SideSheet,
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconClose, IconKey, IconPlus, IconSave, IconSearch } from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Copy, KeyRound, MoreHorizontal, Trash2 } from 'lucide-react';

const { Text, Title } = Typography;

const ACTIVATION_CODE_ACTIONS = {
  DELETE: 'delete',
  ENABLE: 'enable',
  DISABLE: 'disable',
};

const isExpired = (record) =>
  record.status === REDEMPTION_STATUS.UNUSED &&
  record.expired_time !== 0 &&
  record.expired_time < Math.floor(Date.now() / 1000);

const formatTimestamp = (value, fallback = '-') =>
  value && value > 0 ? timestamp2string(value) : fallback;

const ActivationCodeEditor = ({
  visible,
  editingCode,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const isEdit = editingCode?.id !== undefined;
  const [loading, setLoading] = useState(isEdit);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planOptions, setPlanOptions] = useState([]);
  const formApiRef = useRef(null);

  const getInitValues = () => ({
    name: '',
    plan_id: undefined,
    count: 1,
    expired_time: null,
  });

  const loadPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/plans');
      if (res.data?.success) {
        const options = (res.data.data || []).map((item) => ({
          label: item?.plan?.title || `#${item?.plan?.id}`,
          value: item?.plan?.id,
        }));
        setPlanOptions(options);
      } else {
        setPlanOptions([]);
      }
    } catch (error) {
      setPlanOptions([]);
    } finally {
      setPlansLoading(false);
    }
  };

  const loadCode = async () => {
    if (!isEdit) {
      formApiRef.current?.setValues(getInitValues());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await API.get(
        `/api/subscription/admin/activation-codes/${editingCode.id}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        const nextValues = {
          ...getInitValues(),
          ...data,
          expired_time:
            data.expired_time && data.expired_time > 0
              ? new Date(data.expired_time * 1000)
              : null,
        };
        formApiRef.current?.setValues(nextValues);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      return;
    }
    loadPlans();
  }, [visible]);

  useEffect(() => {
    if (!visible || !formApiRef.current) {
      return;
    }
    loadCode();
  }, [visible, editingCode?.id]);

  const handleSubmit = async (values) => {
    setLoading(true);
    const payload = {
      name: (values.name || '').trim(),
      plan_id: Number(values.plan_id),
      count: parseInt(values.count, 10) || 0,
      expired_time: values.expired_time
        ? Math.floor(values.expired_time.getTime() / 1000)
        : 0,
    };

    try {
      let res;
      if (isEdit) {
        res = await API.put('/api/subscription/admin/activation-codes', {
          ...payload,
          id: parseInt(editingCode.id, 10),
        });
      } else {
        res = await API.post('/api/subscription/admin/activation-codes', payload);
      }

      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        setLoading(false);
        return;
      }

      if (isEdit) {
        showSuccess(t('激活码更新成功！'));
        await onSuccess();
        onClose();
      } else {
        showSuccess(t('激活码创建成功！'));
        await onSuccess();
        formApiRef.current?.setValues(getInitValues());
        onClose();

        if (Array.isArray(data) && data.length > 0) {
          const text = data.join('\n') + '\n';
          Modal.confirm({
            title: t('激活码创建成功'),
            content: (
              <div>
                <p>{t('激活码创建成功，是否下载激活码？')}</p>
                <p>{t('激活码将以文本文件的形式下载，文件名为激活码的名称。')}</p>
              </div>
            ),
            onOk: () => {
              downloadTextAsFile(text, `${payload.name || t('激活码')}.txt`);
            },
          });
        }
      }
    } catch (error) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SideSheet
      placement={isEdit ? 'right' : 'left'}
      visible={visible}
      width={isMobile ? '100%' : 600}
      closeIcon={null}
      bodyStyle={{ padding: 0 }}
      title={
        <Space>
          <Tag color={isEdit ? 'blue' : 'green'} shape='circle'>
            {isEdit ? t('更新') : t('新建')}
          </Tag>
          <Title heading={4} className='m-0'>
            {isEdit ? t('更新激活码信息') : t('创建新的激活码')}
          </Title>
        </Space>
      }
      footer={
        <div className='flex justify-end bg-white'>
          <Space>
            <Button
              theme='solid'
              icon={<IconSave />}
              loading={loading}
              onClick={() => formApiRef.current?.submitForm()}
            >
              {t('提交')}
            </Button>
            <Button
              theme='light'
              type='primary'
              icon={<IconClose />}
              onClick={onClose}
            >
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
      onCancel={onClose}
    >
      <Spin spinning={loading || plansLoading}>
        <Form
          initValues={getInitValues()}
          getFormApi={(api) => {
            formApiRef.current = api;
          }}
          onSubmit={handleSubmit}
        >
          <div className='p-2'>
            <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
              <div className='flex items-center mb-2'>
                <Avatar size='small' color='blue' className='mr-2 shadow-md'>
                  <KeyRound size={16} />
                </Avatar>
                <div>
                  <Text className='text-lg font-medium'>{t('基本信息')}</Text>
                  <div className='text-xs text-gray-600'>
                    {t('设置激活码的基本信息和订阅套餐')}
                  </div>
                </div>
              </div>

              <Row gutter={12}>
                <Col span={24}>
                  <Form.Input
                    field='name'
                    label={t('名称')}
                    placeholder={t('请输入名称')}
                    rules={
                      !isEdit
                        ? []
                        : [{ required: true, message: t('请输入名称') }]
                    }
                    showClear
                  />
                </Col>
                <Col span={24}>
                  <Form.Select
                    field='plan_id'
                    label={t('绑定订阅套餐')}
                    placeholder={t('请选择订阅套餐')}
                    loading={plansLoading}
                    rules={[{ required: true, message: t('请选择订阅套餐') }]}
                    style={{ width: '100%' }}
                    filter
                  >
                    {planOptions.map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label}
                      </Select.Option>
                    ))}
                  </Form.Select>
                </Col>
                {!isEdit && (
                  <Col span={12}>
                    <Form.InputNumber
                      field='count'
                      label={t('数量')}
                      min={1}
                      max={100}
                      precision={0}
                      rules={[{ required: true, message: t('请输入数量') }]}
                      style={{ width: '100%' }}
                    />
                  </Col>
                )}
                <Col span={isEdit ? 24 : 12}>
                  <Form.DatePicker
                    field='expired_time'
                    label={t('过期时间')}
                    type='dateTime'
                    placeholder={t('选择过期时间（可选，留空为永久）')}
                    style={{ width: '100%' }}
                    showClear
                  />
                </Col>
              </Row>
            </Card>
          </div>
        </Form>
      </Spin>
    </SideSheet>
  );
};

const SubscriptionActivationCodesPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [codeCount, setCodeCount] = useState(0);
  const [selectedRows, setSelectedRows] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [editingCode, setEditingCode] = useState({ id: undefined });
  const [formApi, setFormApi] = useState(null);
  const [compactMode, setCompactMode] = useTableCompactMode('activation-codes');

  const formInitValues = {
    searchKeyword: '',
  };

  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    return {
      searchKeyword: formValues.searchKeyword || '',
    };
  };

  const loadCodes = async (page = 1, currentPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/subscription/admin/activation-codes?p=${page}&page_size=${currentPageSize}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setActivePage(data.page <= 0 ? 1 : data.page);
        setCodeCount(data.total);
        setCodes(data.items || []);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message || t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  const searchCodes = async (page = 1, currentPageSize = pageSize) => {
    const { searchKeyword } = getFormValues();
    if (!searchKeyword) {
      await loadCodes(page, currentPageSize);
      return;
    }

    setSearching(true);
    try {
      const res = await API.get(
        `/api/subscription/admin/activation-codes/search?keyword=${encodeURIComponent(searchKeyword)}&p=${page}&page_size=${currentPageSize}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setActivePage(data.page || 1);
        setCodeCount(data.total);
        setCodes(data.items || []);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message || t('请求失败'));
    } finally {
      setSearching(false);
    }
  };

  const refresh = async (page = activePage) => {
    const { searchKeyword } = getFormValues();
    if (searchKeyword) {
      await searchCodes(page, pageSize);
    } else {
      await loadCodes(page, pageSize);
    }
  };

  useEffect(() => {
    loadCodes(1, pageSize).catch((reason) => {
      showError(String(reason));
    });
  }, [pageSize]);

  const handlePageChange = (page) => {
    setActivePage(page);
    const { searchKeyword } = getFormValues();
    if (searchKeyword) {
      searchCodes(page, pageSize);
      return;
    }
    loadCodes(page, pageSize);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
    const { searchKeyword } = getFormValues();
    if (searchKeyword) {
      searchCodes(1, size);
      return;
    }
    loadCodes(1, size);
  };

  const closeEdit = () => {
    setShowEdit(false);
    setTimeout(() => {
      setEditingCode({ id: undefined });
    }, 300);
  };

  const handleAdd = () => {
    setEditingCode({ id: undefined });
    setShowEdit(true);
  };

  const copyText = async (text) => {
    if (await copy(text)) {
      showSuccess(t('已复制到剪贴板！'));
      return;
    }

    Modal.error({
      title: t('无法复制到剪贴板，请手动复制'),
      content: text,
      size: 'large',
    });
  };

  const manageCode = async (id, action, record) => {
    setLoading(true);
    try {
      let res;
      if (action === ACTIVATION_CODE_ACTIONS.DELETE) {
        res = await API.delete(`/api/subscription/admin/activation-codes/${id}`);
      } else {
        const nextStatus =
          action === ACTIVATION_CODE_ACTIONS.ENABLE
            ? REDEMPTION_STATUS.UNUSED
            : REDEMPTION_STATUS.DISABLED;
        res = await API.put(
          '/api/subscription/admin/activation-codes?status_only=true',
          {
            id,
            status: nextStatus,
          },
        );
      }

      const { success, message } = res.data;
      if (!success) {
        showError(message);
        return;
      }

      showSuccess(t('操作成功完成！'));
      await refresh();
    } catch (error) {
      showError(error.message || t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  const batchCopyCodes = async () => {
    if (selectedRows.length === 0) {
      showError(t('请至少选择一个激活码！'));
      return;
    }
    const text = selectedRows
      .map((item) => `${item.name}    ${item.key}`)
      .join('\n');
    await copyText(text);
  };

  const batchDeleteInvalidCodes = async () => {
    Modal.confirm({
      title: t('确定清除所有失效激活码？'),
      content: t('将删除已使用、已禁用及过期的激活码，此操作不可撤销。'),
      onOk: async () => {
        setLoading(true);
        try {
          const res = await API.delete(
            '/api/subscription/admin/activation-codes/invalid',
          );
          const { success, message, data } = res.data;
          if (!success) {
            showError(message);
            return;
          }
          showSuccess(t('已删除 {{count}} 条失效激活码', { count: data }));
          await refresh();
        } catch (error) {
          showError(error.message || t('请求失败'));
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const rowSelection = {
    onChange: (selectedRowKeys, rows) => {
      setSelectedRows(rows);
    },
  };

  const handleRow = (record) => {
    if (record.status !== REDEMPTION_STATUS.UNUSED || isExpired(record)) {
      return {
        style: {
          background: 'var(--semi-color-disabled-border)',
        },
      };
    }
    return {};
  };

  const columns = useMemo(
    () => [
      {
        title: t('ID'),
        dataIndex: 'id',
      },
      {
        title: t('名称'),
        dataIndex: 'name',
      },
      {
        title: t('绑定订阅套餐'),
        key: 'plan',
        render: (_, record) => record.plan_title || `#${record.plan_id}`,
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        render: (value, record) => {
          if (isExpired(record)) {
            return (
              <Tag color='orange' shape='circle'>
                {t('已过期')}
              </Tag>
            );
          }

          const statusConfig = REDEMPTION_STATUS_MAP[value];
          if (!statusConfig) {
            return (
              <Tag color='grey' shape='circle'>
                {t('未知状态')}
              </Tag>
            );
          }

          return (
            <Tag color={statusConfig.color} shape='circle'>
              {t(statusConfig.text)}
            </Tag>
          );
        },
      },
      {
        title: t('创建时间'),
        dataIndex: 'created_time',
        render: (value) => formatTimestamp(value),
      },
      {
        title: t('过期时间'),
        dataIndex: 'expired_time',
        render: (value) =>
          value === 0 ? t('永不过期') : formatTimestamp(value),
      },
      {
        title: t('激活时间'),
        dataIndex: 'activated_time',
        render: (value) => formatTimestamp(value, t('未激活')),
      },
      {
        title: t('激活用户ID'),
        dataIndex: 'used_user_id',
        render: (value) => (value > 0 ? value : t('无')),
      },
      {
        title: t('订阅ID'),
        dataIndex: 'activated_subscription_id',
        render: (value) => (value > 0 ? value : '-'),
      },
      {
        title: '',
        dataIndex: 'operate',
        fixed: 'right',
        width: 205,
        render: (_, record) => {
          const moreMenuItems = [
            {
              node: 'item',
              name: t('删除'),
              type: 'danger',
              onClick: () => {
                Modal.confirm({
                  title: t('确定是否要删除此激活码？'),
                  content: t('此修改将不可逆'),
                  type: 'warning',
                  onOk: async () => {
                    await manageCode(record.id, ACTIVATION_CODE_ACTIONS.DELETE, record);
                  },
                });
              },
            },
          ];

          if (record.status === REDEMPTION_STATUS.UNUSED && !isExpired(record)) {
            moreMenuItems.push({
              node: 'item',
              name: t('禁用'),
              type: 'warning',
              onClick: () =>
                manageCode(record.id, ACTIVATION_CODE_ACTIONS.DISABLE, record),
            });
          } else if (!isExpired(record)) {
            moreMenuItems.push({
              node: 'item',
              name: t('启用'),
              type: 'secondary',
              disabled: record.status === REDEMPTION_STATUS.USED,
              onClick: () =>
                manageCode(record.id, ACTIVATION_CODE_ACTIONS.ENABLE, record),
            });
          }

          return (
            <Space>
              <Popover content={record.key} style={{ padding: 20 }} position='top'>
                <Button type='tertiary' size='small'>
                  {t('查看')}
                </Button>
              </Popover>
              <Button
                size='small'
                icon={<Copy size={14} />}
                onClick={() => copyText(record.key)}
              >
                {t('复制')}
              </Button>
              <Button
                type='tertiary'
                size='small'
                disabled={record.status !== REDEMPTION_STATUS.UNUSED}
                onClick={() => {
                  setEditingCode(record);
                  setShowEdit(true);
                }}
              >
                {t('编辑')}
              </Button>
              <Dropdown trigger='click' position='bottomRight' menu={moreMenuItems}>
                <Button
                  type='tertiary'
                  size='small'
                  icon={<MoreHorizontal size={14} />}
                />
              </Dropdown>
            </Space>
          );
        },
      },
    ],
    [t],
  );

  const tableColumns = useMemo(
    () =>
      compactMode
        ? columns.map((col) => {
            if (col.dataIndex === 'operate') {
              const { fixed, ...rest } = col;
              return rest;
            }
            return col;
          })
        : columns,
    [columns, compactMode],
  );

  return (
    <>
      <ActivationCodeEditor
        visible={showEdit}
        editingCode={editingCode}
        onClose={closeEdit}
        onSuccess={refresh}
      />

      <CardPro
        type='type1'
        descriptionArea={
          <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
            <div className='flex items-center text-blue-500'>
              <KeyRound size={16} className='mr-2' />
              <Text>{t('激活码管理')}</Text>
            </div>

            <CompactModeToggle
              compactMode={compactMode}
              setCompactMode={setCompactMode}
              t={t}
            />
          </div>
        }
        actionsArea={
          <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
            <div className='flex flex-wrap gap-2 w-full md:w-auto order-2 md:order-1'>
              <Button type='primary' size='small' onClick={handleAdd}>
                {t('添加激活码')}
              </Button>
              <Button type='tertiary' size='small' onClick={batchCopyCodes}>
                {t('复制所选激活码到剪贴板')}
              </Button>
              <Button
                type='danger'
                size='small'
                icon={<Trash2 size={14} />}
                onClick={batchDeleteInvalidCodes}
              >
                {t('清除失效激活码')}
              </Button>
            </div>

            <Form
              initValues={formInitValues}
              getFormApi={setFormApi}
              onSubmit={() => searchCodes(1, pageSize)}
              allowEmpty
              autoComplete='off'
              layout='horizontal'
              trigger='change'
              stopValidateWithError={false}
              className='w-full md:w-auto order-1 md:order-2'
            >
              <div className='flex flex-col md:flex-row items-center gap-2 w-full md:w-auto'>
                <div className='relative w-full md:w-64'>
                  <Form.Input
                    field='searchKeyword'
                    prefix={<IconSearch />}
                    placeholder={t('关键字(id或者名称)')}
                    showClear
                    pure
                    size='small'
                  />
                </div>
                <div className='flex gap-2 w-full md:w-auto'>
                  <Button
                    type='tertiary'
                    htmlType='submit'
                    loading={loading || searching}
                    className='flex-1 md:flex-initial'
                    size='small'
                  >
                    {t('查询')}
                  </Button>
                  <Button
                    type='tertiary'
                    size='small'
                    className='flex-1 md:flex-initial'
                    onClick={() => {
                      if (!formApi) return;
                      formApi.reset();
                      setTimeout(() => {
                        loadCodes(1, pageSize);
                      }, 100);
                    }}
                  >
                    {t('重置')}
                  </Button>
                </div>
              </div>
            </Form>
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: activePage,
          pageSize,
          total: codeCount,
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
          isMobile,
          t,
        })}
        t={t}
      >
        <CardTable
          columns={tableColumns}
          dataSource={codes}
          rowKey='id'
          scroll={compactMode ? undefined : { x: 'max-content' }}
          pagination={{
            currentPage: activePage,
            pageSize,
            total: codeCount,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            onPageSizeChange: handlePageSizeChange,
            onPageChange: handlePageChange,
          }}
          hidePagination
          loading={loading}
          rowSelection={rowSelection}
          onRow={handleRow}
          empty={
            <Empty
              image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
              darkModeImage={
                <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
              }
              description={t('搜索无结果')}
              style={{ padding: 30 }}
            />
          }
          className='rounded-xl overflow-hidden'
          size='middle'
        />
      </CardPro>
    </>
  );
};

export default SubscriptionActivationCodesPage;
