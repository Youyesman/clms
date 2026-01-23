export default function formatDate(isoDateTime){
    if (!isoDateTime) {
        return "";
    }
    let date = new Date(isoDateTime);
    if (isNaN(date.getTime())) {
        return "";
    }
    return date.toISOString().split('T')[0];
}