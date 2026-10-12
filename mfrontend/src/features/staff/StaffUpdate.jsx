import { useParams } from 'react-router-dom';
import StaffForm from './StaffForm.jsx';

// /staff/:id/edit
export default function StaffUpdate() {
  const { id } = useParams();
  return <StaffForm id={id} />;
}
