// Public category pages (/c/<value>): the browsable categories of the app (js/services.js → _getServiceCategories /
// _getProductCategories) with their Arabic names. 'other' and 'digital' are left out on purpose: 'other' is a bucket,
// and 'digital' has its own page inside the app (filterByCategory would show an empty list for it).
export const CATEGORIES = {
    design: 'تصميم', programming: 'برمجة', marketing: 'تسويق', writing: 'كتابة', video: 'فيديو', seo: 'SEO',
    audio: 'صوتيات', data: 'بيانات', clothing: 'ملابس', electronics: 'إلكترونيات', home: 'مستلزمات منزلية',
    beauty: 'مستحضرات تجميل', food: 'أطعمة ومشروبات', accessories: 'إكسسوارات',
};
export const isCategory = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIES, c);
