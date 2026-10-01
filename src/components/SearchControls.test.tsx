import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {SearchControls} from './SearchControls';
afterEach(cleanup);
describe('combined search conditions',()=>{
 it('changes one condition without dropping the others and removes chips independently',()=>{
  const change=vi.fn(),clearQuery=vi.fn();render(<SearchControls filters={{selectedDate:'2026-10-03',area:'hokusetsu',sort:'date',free:true,categories:['music']}} onChange={change} query="祭り" onClearQuery={clearQuery} today="2026-09-28" dateLabel="2026-10-03" onClearDate={vi.fn()} onOpenFilters={vi.fn()} onReset={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('エリア'),{target:{value:'sakai'}});expect(change).toHaveBeenLastCalledWith(expect.objectContaining({area:'sakai',selectedDate:'2026-10-03',sort:'date',free:true,categories:['music']}));
  fireEvent.click(screen.getByRole('button',{name:'無料を解除'}));expect(change.mock.calls.at(-1)?.[0]).toMatchObject({area:'hokusetsu',selectedDate:'2026-10-03'});expect(change.mock.calls.at(-1)?.[0].free).toBeUndefined();
  fireEvent.click(screen.getByRole('button',{name:'検索：祭りを解除'}));expect(clearQuery).toHaveBeenCalledOnce();
 });
});
