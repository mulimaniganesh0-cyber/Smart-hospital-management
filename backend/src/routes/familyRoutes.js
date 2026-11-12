const router=require('express').Router(); const {protect,authorize}=require('../middleware/auth'); const family=require('../controllers/familyController');
router.use(protect,authorize('patient')); router.get('/',family.list); router.post('/',family.add); router.put('/:id/respond',family.respond); router.get('/:patientId/records',family.records); module.exports=router;
